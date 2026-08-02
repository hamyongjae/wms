package com.example.wms.billing.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import com.example.wms.billing.notification.BillingNotification;
import com.example.wms.billing.notification.BillingNotificationEvent;
import com.example.wms.billing.notification.NotificationType;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.security.tenant.TenantContext;
import com.example.wms.billing.support.ProrationCalculator;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;

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

    // 청구 대상 = 아직 출고되지 않은 활성 계약 (입고 상태)
    private static final List<OrderStatus> ACTIVE_STATUSES =
            List.of(OrderStatus.INBOUND);

    private final BillingLedgerRepository ledgerRepository;
    private final StorageOrderRepository storageOrderRepository;
    private final ProrationCalculator prorationCalculator;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * 지정 월(targetMonth)의 청구 원장을 활성 계약마다 자동 생성한다.
     * 이미 같은 계약·같은 기간 원장이 있으면 건너뛴다(중복 방지).
     * @return 생성된 원장 수
     */
    @Transactional
    public int generateMonthlyLedgers(YearMonth targetMonth) {
        LocalDate periodStart = targetMonth.atDay(1);
        LocalDate periodEnd = targetMonth.atEndOfMonth();

        List<StorageOrder> activeOrders = storageOrderRepository.findByStatusIn(ACTIVE_STATUSES);
        int created = 0;

        for (StorageOrder order : activeOrders) {
            // [수동 정산 계약 제외] 등록 시 최초 청구서는 이 값과 무관하게 항상 자동 발행되지만,
            //   이후 매월 반복 자동 생성은 '자동'으로 설정된 계약만 대상으로 한다.
            if (!Boolean.TRUE.equals(order.getAutoBillingEnabled())) {
                continue;
            }
            // [이중청구 방지] 이번 달 구간과 겹치는 원장(계약 등록 시 자동 발행분 포함)이 이미 있으면 건너뜀
            if (ledgerRepository.existsActiveLedgerOverlapping(order.getId(), periodStart, periodEnd)) {
                continue;
            }
            LocalDate dueDate = recurringDueDate(order, targetMonth);
            BigDecimal base = prorationCalculator.prorateMonthly(
                    BigDecimal.valueOf(order.getMonthlyFee()), periodStart, periodEnd);

            BillingLedger ledger = new BillingLedger(
                    order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                    BillingType.MONTHLY, SettlementType.POSTPAID,
                    periodStart, periodEnd, base, MoneyPolicy.ZERO, dueDate);
            ledger.issue(dueDate);   // 자동 생성분은 바로 발행(청구 확정)
            // [테넌트 격리] 배치는 로그인 사용자가 없어 ROOT 컨텍스트로 돈다. 읽기는 전 테넌트를
            //   가로질러야 하므로 그대로 두고, 저장만 그 계약의 업체로 명시 전환한다.
            //   (전환하지 않으면 tenant_id 가 채워지지 않아 FK 위반으로 즉시 실패한다 — 조용한 오염 없음)
            TenantContext.runAs(order.getTenantId(), () -> ledgerRepository.save(ledger));
            created++;
        }
        return created;
    }

    /**
     * [계약별 납기일] 배치 생성 시점(매월 1일)은 전 계약 공통이지만, 실제 납기는 계약마다 다르다.
     * 계약에 저장된 dueDate의 '일(day)' 값을 매월 반복되는 납기 기준일로 삼는다.
     * 기준일이 그 달에 없는 날짜(31일 등)면 그 달의 마지막 날로 자동 보정한다(말일 클램프).
     * dueDate가 없는 레거시 계약만 10일을 기본값으로 쓴다.
     */
    private LocalDate recurringDueDate(StorageOrder order, YearMonth targetMonth) {
        int anchorDay = order.getDueDate() != null ? order.getDueDate().getDayOfMonth() : 10;
        int day = Math.min(anchorDay, targetMonth.lengthOfMonth());
        return targetMonth.atDay(day);
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
     * @return 새로 발행한 청구서 수
     */
    @Transactional
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

            BigDecimal base = prorationCalculator.prorateMonthly(
                    BigDecimal.valueOf(order.getMonthlyFee()), periodStart, periodEnd);

            BillingLedger ledger = new BillingLedger(
                    order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                    BillingType.MONTHLY, SettlementType.POSTPAID,
                    periodStart, periodEnd, base, MoneyPolicy.ZERO, dueDate);
            ledger.issue(dueDate);   // 발행(입금예정, 미납=전액)
            // [테넌트 격리] 위와 동일 — 저장 시점에만 해당 업체로 전환한다
            TenantContext.runAs(order.getTenantId(), () -> ledgerRepository.save(ledger));
            created++;
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

    private String generateLedgerNo() {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String ledgerNo;
        do {
            int random = (int) (Math.random() * 10000);
            ledgerNo = String.format("LDG-%s-%04d", datePart, random);
        } while (ledgerRepository.existsByLedgerNo(ledgerNo));
        return ledgerNo;
    }
}
