package com.example.wms.billing.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.notification.BillingNotification;
import com.example.wms.billing.notification.BillingNotificationEvent;
import com.example.wms.billing.notification.NotificationType;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.security.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

/**
 * 청구 배치(스케줄러) 전용 서비스.
 *
 * [핵심] 로그인 사용자가 없는 스케줄러 문맥에서 실행되므로
 *   SecurityUtils(테넌트 컨텍스트)에 의존하지 않고, 전 테넌트를 직접 순회한다.
 *   각 원장의 소속은 계약(StorageOrder)이 들고 있는 tenant를 그대로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class BillingBatchService {

    private static final Logger log = LoggerFactory.getLogger(BillingBatchService.class);

    // 청구 대상 = 아직 출고되지 않은 활성 계약 (입고 상태)
    private static final List<OrderStatus> ACTIVE_STATUSES =
            List.of(OrderStatus.INBOUND);

    private final BillingLedgerRepository ledgerRepository;
    private final StorageOrderRepository storageOrderRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final BillingLedgerIssuer ledgerIssuer;

    // [폭주 방지] 계약당 1회 실행에서 소급 생성할 수 있는 최대 회차(약 2년). 장기 다운타임 복구 시
    //   밀린 회차를 한 번에 캐치업하되, 데이터 이상(예: 원장이 영영 안 생기는 버그)으로 무한정 쌓이는
    //   것을 막는 안전판이다.
    private static final int MAX_PERIODS_PER_RUN = 24;

    /**
     * [롤링 청구] 계약마다 "직전 원장 종료일 다음날"을 다음 회차 시작일로 삼아, 그날이 이미 지났으면
     * (=asOfDate 이하) 그 회차 원장을 생성한다. 계약마다 원래 입고일 리듬을 유지한 채 생성일이
     * 자연히 분산되고(매달 1일 일괄 생성 문제 해소), 계약이 이어붙는 구조라 별도 마이그레이션 없이도
     * 항상 직전 원장과 정합된다.
     *
     * 서버가 며칠 멈췄다 복구된 경우 계약당 최대 {@link #MAX_PERIODS_PER_RUN}회차까지 한 번에
     * 캐치업 생성한다 — 실제로 보관은 계속 진행 중이었으므로 매출 인식을 인위적으로 지연시키지 않는다.
     *
     * [예정 출고일 임박 - 마지막 회차 축소] 새로 만들 회차 안에 계약의 예정 출고일이 들어오면(=한
     * 달을 다 채우기 전에 나갈 예정이면) 꽉 찬 한 달 대신 그 예정일까지만 청구하고 이 계약의 롤링을
     * 멈춘다 — 나중에 관리자가 중도출고 정산으로 수동으로 줄일 필요가 없다. 예정일이 이미 지났는데도
     * 아직 미출고(=출고가 늦어짐)면 대상이 아니다 — 그런 계약은 지금처럼 꽉 찬 한 달을 계속 굴리고
     * 예정일 자체를 뒤로 밀어준다(아래 extendOrderPeriod 참고). 실제로 그 예정일에 맞춰 출고 처리
     * (OUTBOUND 전환)되면 계약이 activeOrders 대상에서 아예 빠지므로 그 뒤로는 신경 쓸 필요가 없다.
     *
     * [트랜잭션 경계 주의] 이 메서드는 절대 {@code @Transactional}을 붙이면 안 된다 — 여러 테넌트를
     * 순회하며 {@link BillingLedgerIssuer#issueIfNotOverlapping}(REQUIRES_NEW)을 반복 호출하는데,
     * 이 메서드 자체가 이미 트랜잭션 안이면 그 REQUIRES_NEW가 "이미 활성인 트랜잭션을 suspend"하게
     * 되어 재개(resume) 시 세션이 오염되는 문제가 있었다(재현·확인됨). 이 메서드가 트랜잭션 없이
     * 시작해야 REQUIRES_NEW가 매번 완전히 새 최상위 트랜잭션으로만 동작해 안전하다.
     * (읽기 쿼리들은 Spring Data 리포지토리가 메서드마다 자체적으로 짧은 트랜잭션을 열어준다.)
     *
     * @return 생성된 원장 수
     */
    public int generateDueLedgers(LocalDate asOfDate) {
        List<StorageOrder> activeOrders = storageOrderRepository.findByStatusIn(ACTIVE_STATUSES);
        int created = 0;

        for (StorageOrder order : activeOrders) {
            // [수동 정산 계약 제외] 등록 시 최초 청구서는 이 값과 무관하게 항상 자동 발행되지만,
            //   이후 반복 자동 생성은 '자동'으로 설정된 계약만 대상으로 한다.
            if (!Boolean.TRUE.equals(order.getAutoBillingEnabled())) {
                continue;
            }
            if (order.getMonthlyFee() == null || order.getMonthlyFee() <= 0) {
                log.warn("[청구배치] monthlyFee 미설정/0 이하 — 갱신 건너뜀. orderId={}", order.getId());
                continue;
            }

            Optional<BillingLedger> last = ledgerRepository
                    .findFirstByStorageOrderIdAndStatusNotOrderByBillingPeriodEndDesc(
                            order.getId(), BillingStatus.CANCELED);
            if (last.isEmpty()) {
                // 정상 흐름에서는 발생하지 않는다(등록 시 항상 최초 원장이 생김). 원장이 하나도 없는
                // 결손 계약은 backfillMissingLedgers()가 처리하도록 위임하고 여기서는 만들지 않는다.
                log.warn("[청구배치] 원장 0건인 활성 계약 — backfill 대상, 이번 실행 skip. orderId={}", order.getId());
                continue;
            }

            LocalDate nextStart = last.get().getBillingPeriodEnd().plusDays(1);
            int guard = 0;
            while (!nextStart.isAfter(asOfDate)) {
                if (++guard > MAX_PERIODS_PER_RUN) {
                    log.error("[청구배치] orderId={} 밀린 회차가 {}건을 초과 — 데이터 점검 필요, 이번 실행 중단",
                            order.getId(), MAX_PERIODS_PER_RUN);
                    break;
                }

                LocalDate periodStart = nextStart;
                LocalDate fullPeriodEnd = periodStart.plusMonths(1).minusDays(1);
                // [예정 출고일 임박 - 마지막 회차 축소] 예정 출고일이 이번 회차 안에 들어오면
                // (=한 달을 다 채우기 전에 나갈 예정이면) 굳이 꽉 찬 한 달을 청구한 뒤 나중에
                // 관리자가 중도출고 정산으로 수동으로 줄이게 하지 않고, 처음부터 예정 출고일까지만
                // 청구한다. 예정일이 이미 지났는데 아직 미출고(=출고가 늦어짐)면 대상이 아니다 —
                // 그런 경우는 지금처럼 꽉 찬 한 달을 계속 굴리고 예정일 자체를 뒤로 밀어준다
                // (extendOrderPeriod). 예정일 미정(장기 계약)도 당연히 대상 아님.
                LocalDate expectedEnd = order.getExpectedEndDate();
                boolean isFinalRound = expectedEnd != null
                        && !expectedEnd.isBefore(periodStart) && expectedEnd.isBefore(fullPeriodEnd);
                LocalDate periodEnd = isFinalRound ? expectedEnd : fullPeriodEnd;
                // 짧게 자른 마지막 회차는 "매달 N일" 패턴을 그대로 적용하면 납기일이 회차 종료일보다
                // 뒤로 밀릴 수 있다(예: 매달 25일 납부인데 회차가 10일에 끝남) — 후불 소급분과 동일하게
                // 납기일 = 회차 종료일로 둔다.
                LocalDate dueDate = isFinalRound ? periodEnd : recurringDueDate(order, periodStart);

                // [테넌트 격리] runAs override는 반드시 issuer 호출을 "감싸는" 형태여야 한다 — issuer의
                //   @Transactional(REQUIRES_NEW) 프록시가 새 세션을 여는 시점에 override가 이미
                //   걸려 있어야 그 세션이 정확한 테넌트로 확정된다(자세한 내용은 BillingLedgerIssuer 참고).
                boolean issued = TenantContext.runAs(order.getTenantId(), () ->
                        ledgerIssuer.issueIfNotOverlapping(order, periodStart, periodEnd, dueDate));
                if (!issued) {
                    // [이중청구 방지] 정상 흐름에선 발생하지 않지만, 동시 실행·수동 원장 개입에 대비한 안전망
                    log.warn("[청구배치] orderId={} 기간[{}~{}]과 겹치는 원장이 이미 존재 — 이후 회차도 중단",
                            order.getId(), periodStart, periodEnd);
                    break;
                }
                created++;

                nextStart = periodEnd.plusDays(1);
            }
        }
        return created;
    }

    /**
     * [계약별 납기일] 계약에 저장된 dueDate의 '일(day)' 값을, 이번 회차가 시작하는 달 기준으로
     * 재적용한다(말일 클램프, dueDate 없는 레거시 계약은 10일 기본값). 롤링 주기에서는 회차
     * 시작일이 매번 달라지므로, 계산된 납기일이 회차 시작일보다 이르면(예: "매달 5일 납부"인데
     * 이번 회차가 15일에 시작) 다음 달의 같은 날짜로 굴려 보내 "매달 N일 납부"라는 원래 협의
     * 의미를 그대로 보존한다. 단순히 회차 시작일로 당겨버리면 이 의미가 사라진다.
     */
    private LocalDate recurringDueDate(StorageOrder order, LocalDate periodStart) {
        int anchorDay = order.getDueDate() != null ? order.getDueDate().getDayOfMonth() : 10;
        YearMonth ym = YearMonth.from(periodStart);
        LocalDate candidate = ym.atDay(Math.min(anchorDay, ym.lengthOfMonth()));
        if (candidate.isBefore(periodStart)) {
            YearMonth nextYm = ym.plusMonths(1);
            candidate = nextYm.atDay(Math.min(anchorDay, nextYm.lengthOfMonth()));
        }
        return candidate;
    }

    /**
     * [매출 구멍 차단 - self-heal] 청구 원장이 하나도 없는 활성(입고) 계약에 후불 청구서를 소급 발행한다.
     *
     * 배경: '계약 등록 시 청구서 자동 발행' 도입 전에 만들어진 후불 계약은 원장이 없어
     *       매출·미수 집계에서 누락된다(매출 구멍). 이 배치가 결손 계약을 찾아 원장을 채운다.
     *
     * 효율: NOT EXISTS 단일 쿼리로 결손 계약만 선별(findActiveWithoutLedger) → 전체 스캔 없음.
     * 멱등: 이미 원장이 있으면 대상에서 빠지므로 반복 실행해도 안전(재실행 시 0건).
     *
     * [트랜잭션 경계 주의] generateDueLedgers와 동일한 이유로 이 메서드도 {@code @Transactional}을
     * 붙이지 않는다.
     *
     * @return 새로 발행한 청구서 수
     */
    public int backfillMissingLedgers() {
        List<StorageOrder> missing = storageOrderRepository.findActiveWithoutLedger();
        int created = 0;
        for (StorageOrder order : missing) {
            if (order.getMonthlyFee() == null || order.getMonthlyFee() <= 0) continue;
            LocalDate periodStart = order.getStorageStartDate();
            // [출고일 미정 임시 기간] 월 단위 청구이므로 한 달로 잡는다 (등록·수정과 동일 규칙)
            LocalDate periodEnd = order.getExpectedEndDate() != null
                    ? order.getExpectedEndDate() : periodStart.plusMonths(1).minusDays(1);
            LocalDate dueDate = periodEnd;   // 후불 소급분 납기 = 보관 종료일

            boolean issued = TenantContext.runAs(order.getTenantId(), () ->
                    ledgerIssuer.issueIfNotOverlapping(order, periodStart, periodEnd, dueDate));
            if (issued) created++;
        }
        return created;
    }

    /**
     * 전 테넌트의 미납(납기 경과 + 잔액>0) 원장에 미납 촉구 알림 발송.
     * @return 발송 대상 건수
     */
    @Transactional
    public int sendAllOverdueReminders() {
        List<BillingLedger> overdue = ledgerRepository.findAllOverdue(LocalDate.now());
        for (BillingLedger ledger : overdue) {
            BillingNotification notification = new BillingNotification(
                    ledger.getTenant().getId(), ledger.getId(), ledger.getLedgerNo(),
                    NotificationType.OVERDUE_REMINDER,
                    ledger.getCustomer().getName(), ledger.getCustomer().getPhoneNumber(),
                    ledger.getBalance(), ledger.getDueDate());
            eventPublisher.publishEvent(new BillingNotificationEvent(notification));
        }
        return overdue.size();
    }
}
