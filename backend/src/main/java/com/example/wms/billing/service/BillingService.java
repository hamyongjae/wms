package com.example.wms.billing.service;

import com.example.wms.billing.dto.*;
import com.example.wms.billing.entity.*;
import com.example.wms.billing.notification.BillingNotification;
import com.example.wms.billing.notification.BillingNotificationEvent;
import com.example.wms.billing.notification.NotificationType;
import com.example.wms.billing.repository.BillingAdjustmentRepository;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.billing.repository.PaymentHistoryRepository;
import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.billing.support.ProrationCalculator;
import com.example.wms.billing.support.ProrationCalculator.MidReleaseResult;
import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 청구/미수금 정산 서비스.
 *
 * [동시성] 잔액을 바꾸는 임계 구간(수금·조정·이월·정산)은
 *   findForUpdate(비관적 쓰기 락)로 원장을 잠근 뒤 처리한다.
 *   추가로 엔티티 @Version(낙관적 락)이 이중 방어한다.
 * [격리] 모든 조회·검증은 SecurityUtils의 현재 tenantId로 강제된다.
 * [오딧] 수금/조정은 불변 이력(PaymentHistory/BillingAdjustment)에 처리자와 함께 남는다.
 * [알림] 발송은 직접 호출하지 않고 이벤트로 publish → 커밋 후 리스너가 실제 발송.
 */
@Service
@RequiredArgsConstructor
public class BillingService {

    private final BillingLedgerRepository ledgerRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final BillingAdjustmentRepository adjustmentRepository;
    private final StorageOrderRepository storageOrderRepository;
    private final com.example.wms.container.repository.ContainerRepository containerRepository;
    private final ProrationCalculator prorationCalculator;
    private final ApplicationEventPublisher eventPublisher;

    // ===================== 원장 생성/발행 =====================

    /**
     * [생성=발행 통합] 청구 원장 생성(일할 계산 반영) 즉시 발행까지 한 번에 끝낸다.
     * 예전엔 DRAFT로 만들어두고 관리자가 곧바로 "발행" 버튼을 한 번 더 눌러야 했다 — 사실상 항상
     * 같이 일어나는 두 단계를 억지로 나눠 놓은 것뿐이라, 계약 등록 시 자동 발행(issuePostpaid/
     * settlePrepaid)과 같은 원칙으로 여기서도 생성과 동시에 발행한다.
     */
    @Transactional
    public BillingLedgerResponse createLedger(LedgerCreateRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        StorageOrder order = storageOrderRepository
                .findByIdAndTenantId(req.getStorageOrderId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 계약입니다. id=" + req.getStorageOrderId()));

        // [중복 생성 방지] 모바일에서 생성 버튼을 연달아 눌러도(더블클릭) 시작일이 완전히
        // 같은 회차가 두 번 만들어지지 않게 막는다 — reconcileSchedulePlacement의 이웃 보정
        // 로직은 "정확히 같은 시작일"인 경우 앞/뒤 어느 쪽으로도 안 잡혀 못 걸러낸다.
        if (ledgerRepository.existsByStorageOrderIdAndBillingPeriodStart(order.getId(), req.getPeriodStart())) {
            throw new IllegalArgumentException("이미 같은 시작일의 정산서가 있습니다. 중복 생성이 아닌지 확인하세요.");
        }

        // [자동 보정] 겹치거나 비어도 막지 않고 이웃 회차 경계를 자동으로 맞춰 이어붙인다.
        reconcileSchedulePlacement(order, req.getPeriodStart(), req.getPeriodEnd(), null);

        BigDecimal baseAmount = resolveBaseAmount(req, order);
        BigDecimal carriedOverIn = MoneyPolicy.nvl(req.getCarriedOverIn());

        Tenant tenant = order.getTenant();
        Customer customer = order.getCustomer();

        BillingLedger ledger = new BillingLedger(
                tenant, order, customer, generateLedgerNo(),
                req.getBillingType(), req.getSettlementType(),
                req.getPeriodStart(), req.getPeriodEnd(),
                baseAmount, carriedOverIn, req.getDueDate());

        // 납기 기본값: 미지정 시 결제 방식별 기본(선불=기간 시작일 / 후불=기간 종료일) — 계약 등록과 동일 규칙
        LocalDate due = req.getDueDate() != null ? req.getDueDate()
                : (req.getSettlementType() == SettlementType.PREPAID ? req.getPeriodStart() : req.getPeriodEnd());
        ledger.issue(due);

        BillingLedger saved = ledgerRepository.save(ledger);
        // [보관기간 동기화] 회차 청구가 계약 종료일을 넘기면 계약을 그 종료일까지 자동 연장
        extendOrderPeriod(order, saved.getBillingPeriodEnd());
        return new BillingLedgerResponse(saved);
    }

    /**
     * [보관기간 동기화] 연속 계약(회차 청구·이월)으로 청구 기간이 계약 종료일을 넘어서면,
     * 계약의 출고예정일을 가장 늦은 회차 종료일로 확장한다. (계약·달력이 실제 보관기간과 일치)
     */
    private void extendOrderPeriod(StorageOrder order, LocalDate periodEnd) {
        if (periodEnd == null) return;
        // 이미 출고 완료된 계약은 실제 출고일이 확정이므로 건드리지 않는다.
        if (order.isOutbound()) return;
        LocalDate current = order.getExpectedEndDate();
        // [출고일 미정 보존] 종료일이 없는(1층처럼 계속 쓰는) 계약은 정산서를 새로 만들어도
        // 그대로 미정으로 둔다 — BillingLedgerIssuer.extendOrderPeriod와 동일 규칙.
        if (current == null) return;
        if (periodEnd.isAfter(current)) {
            order.setExpectedEndDate(periodEnd);
            // [일정 동기화] 배정된 컨테이너의 출고예정일도 계약 기준으로 즉시 맞춘다.
            //   (tenant는 SecurityUtils가 아닌 계약 엔티티에서 얻어 배치/요청 문맥 모두에서 동작)
            Long tenantId = order.getTenant().getId();
            for (var c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
                c.setStorageDates(order.getStorageStartDate(), periodEnd);
            }
        }
    }

    /**
     * [선불 계약 자동 정산] 원장 생성 → 발행 → 전액 수금을 한 트랜잭션으로 처리한다.
     * 계약 등록(StorageOrderService.createOrder)에서 호출되어, 부분 실패 없이 원자적으로 완결된다.
     * (호출자의 트랜잭션에 참여 — 계약과 청구가 함께 커밋되거나 함께 롤백된다)
     *
     * @param dueDate 납기일 (미지정 시 보관 시작일). 선불은 완납되므로 미수 판정과 무관하지만,
     *                청구서 표기·감사 목적으로 계약에서 넘어온 값을 그대로 보존한다.
     * @param method  선택된 결제 수단 (현금/카드/계좌이체) — 즉시 수납 처리된 것으로 기록
     */
    @Transactional
    public void settlePrepaid(StorageOrder order, LocalDate periodStart, LocalDate periodEnd,
                              BigDecimal amount, LocalDate dueDate, PaymentMethod method) {
        BigDecimal base = MoneyPolicy.normalize(amount);
        LocalDate due = dueDate != null ? dueDate : periodStart;
        PaymentMethod payMethod = method != null ? method : PaymentMethod.BANK_TRANSFER;

        BillingLedger ledger = new BillingLedger(
                order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                BillingType.MONTHLY, SettlementType.PREPAID,
                periodStart, periodEnd, base, BigDecimal.ZERO, due);

        ledger.issue(due);                      // DRAFT → ISSUED (납기 = 납기일)
        ledgerRepository.save(ledger);

        Long userId = SecurityUtils.getCurrentUser().getUserId();
        paymentHistoryRepository.save(new PaymentHistory(
                order.getTenant(), ledger, base, payMethod,
                periodStart, "선불 계약 - 자동 처리", userId));
        ledger.applyPayment(base);              // 전액 수금 → PAID (미납 0원)
    }

    /**
     * [후불 계약 청구서 자동 발행] 원장 생성 → 발행(ISSUED)까지만 처리한다.
     * 수금은 하지 않으므로 미납액 = 전액(입금예정 상태)으로 원장에 남는다.
     * 납기일 경과 후에도 잔액이 있으면 findOverdue/파생 overdue 로 자연스럽게 연체/미수로 흘러간다.
     * 계약 등록(StorageOrderService.createOrder)에서 호출되어 매출 구멍을 원천 차단한다.
     *
     * @param dueDate 납기일 (미지정 시 보관 종료일, 그마저 없으면 시작일). 이 날짜가 미수 판정의 기준.
     */
    @Transactional
    public void issuePostpaid(StorageOrder order, LocalDate periodStart, LocalDate periodEnd,
                              BigDecimal amount, LocalDate dueDate) {
        BigDecimal base = MoneyPolicy.normalize(amount);
        LocalDate due = dueDate != null ? dueDate
                : (periodEnd != null ? periodEnd : periodStart);

        BillingLedger ledger = new BillingLedger(
                order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                BillingType.MONTHLY, SettlementType.POSTPAID,
                periodStart, periodEnd, base, BigDecimal.ZERO, due);

        ledger.issue(due);                      // DRAFT → ISSUED (미납 = 전액 = 입금예정)
        ledgerRepository.save(ledger);
    }

    /**
     * [과거 계약 등록 - 소급분 일괄 정산] 실제 과거 입고일부터 존재해온 계약을 지금 처음 등록할 때,
     * 이 시스템 밖에서 이미 끝난 과거 기간 전체를 0원·완료(PAID) 원장 1건으로 묶어 남긴다.
     * 월별로 쪼개 소급 청구하지 않는다 — 오늘부터의 진짜 청구는 이 메서드 호출 직후
     * settlePrepaid/issuePostpaid로 별도 생성한다(StorageOrderService.createOrder 참고).
     * baseAmount가 0이면 issue() 직후 recompute()가 balance<=0을 보고 즉시 PAID로 전이하므로
     * 별도 조정(BillingAdjustment)이 필요 없다.
     */
    @Transactional
    public void settleHistoricalBundle(StorageOrder order, LocalDate periodStart, LocalDate periodEnd) {
        BillingLedger ledger = new BillingLedger(
                order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                BillingType.MONTHLY, SettlementType.POSTPAID,
                periodStart, periodEnd, BigDecimal.ZERO, BigDecimal.ZERO, periodEnd);
        ledger.issue(periodEnd);
        ledgerRepository.save(ledger);
    }

    /**
     * [계약 수정 - 청구 조건 재정산] 활성 원장을 계약의 새 결제 방식·납기일에 맞춰 재정렬한다.
     * 계약 등록과 동일한 정산 논리를 소급 적용해 "계약 화면과 원장"이 항상 일치하도록 한다.
     *
     *  · 후불 → 선불 : 남은 미납 잔액을 선택 결제 수단으로 즉시 완납 처리 (미납 0원)
     *  · 선불 → 후불 : 자동 수납분을 전액 취소 → 입금예정(미납=전액)으로 되돌림
     *  · 납기일 변경 : 원장 dueDate 갱신 (연체/미수 판정 기준 재설정)
     *
     * 대상: 취소/이월되지 않은 가장 늦은 회차 원장. 없으면 no-op(안전).
     */
    @Transactional
    public void resettleForOrder(Long storageOrderId, SettlementType newType,
                                 LocalDate newDueDate, PaymentMethod method) {
        BillingLedger target = ledgerRepository.findByStorageOrderId(storageOrderId).stream()
                .filter(l -> l.getStatus() != BillingStatus.CANCELED
                        && l.getStatus() != BillingStatus.CARRIED_OVER)
                .max(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (target == null) return;

        BillingLedger locked = lockLedger(target.getId());
        Long userId = SecurityUtils.getCurrentUser().getUserId();

        // 1) 납기일 재설정
        if (newDueDate != null && !newDueDate.equals(locked.getDueDate())) {
            locked.changeDueDate(newDueDate);
        }

        // 2) 결제 방식 전환 시에만 수금 재정산
        if (newType != null && locked.getSettlementType() != newType) {
            if (newType == SettlementType.PREPAID) {
                // 후불 → 선불: 남은 잔액을 즉시 완납
                BigDecimal balance = locked.getBalance();
                if (balance.signum() > 0) {
                    PaymentMethod payMethod = method != null ? method : PaymentMethod.BANK_TRANSFER;
                    paymentHistoryRepository.save(new PaymentHistory(
                            locked.getTenant(), locked, balance, payMethod,
                            LocalDate.now(), "결제방식 변경(후불→선불) 자동 완납", userId));
                    locked.applyPayment(balance);
                }
            } else {
                // 선불 → 후불: 자동 수납분 전액 취소 → 입금예정
                for (PaymentHistory p : paymentHistoryRepository
                        .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(locked.getId(), locked.getTenant().getId())) {
                    if (!p.isReversed()) {
                        locked.reversePayment(p.getAmount());
                        p.markReversed();
                    }
                }
            }
            locked.changeSettlementType(newType);
        }
    }

    /** 원장 발행 (DRAFT → ISSUED) */
    @Transactional
    public BillingLedgerResponse issueLedger(Long ledgerId, IssueRequest req) {
        BillingLedger ledger = lockLedger(ledgerId);
        ledger.issue(req != null ? req.getDueDate() : ledger.getDueDate());
        return new BillingLedgerResponse(ledger);
    }

    // ===================== 수금 (부분 수금) =====================

    /** 부분 수금 처리 (통장 입금 수동 기록) */
    @Transactional
    public BillingLedgerResponse recordPayment(Long ledgerId, PaymentRequest req) {
        BillingLedger ledger = lockLedger(ledgerId);
        Long userId = SecurityUtils.getCurrentUser().getUserId();

        PaymentHistory payment = new PaymentHistory(
                ledger.getTenant(), ledger, req.getAmount(), req.getMethod(),
                req.getPaidOn(), req.getMemo(), userId);
        paymentHistoryRepository.save(payment);

        ledger.applyPayment(req.getAmount());

        // 완납되면 영수 안내 발송(이벤트)
        if (ledger.getStatus() == BillingStatus.PAID) {
            publish(ledger, NotificationType.PAYMENT_RECEIPT);
        }
        return new BillingLedgerResponse(ledger);
    }

    /** 수금 취소/정정 (해당 수금 건 무효화 + 잔액 원복) */
    @Transactional
    public BillingLedgerResponse reversePayment(Long paymentId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        PaymentHistory payment = paymentHistoryRepository.findByIdAndTenantId(paymentId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 수금 건입니다. id=" + paymentId));
        if (payment.isReversed()) {
            throw new IllegalArgumentException("이미 취소된 수금 건입니다.");
        }

        BillingLedger ledger = lockLedger(payment.getBillingLedger().getId());
        ledger.reversePayment(payment.getAmount());
        payment.markReversed();

        return new BillingLedgerResponse(ledger);
    }

    /**
     * [취소 롤백] 실수로 취소한 수금 건을 다시 유효한 수금으로 되돌린다.
     * 원장에 금액을 재반영하므로, 그 사이 원장이 취소/이월돼 더 이상 변경할 수 없는 상태라면
     * 도메인 규칙(requireActive)이 막는다 — 그런 경우는 되돌리지 않고 예외로 알린다.
     */
    @Transactional
    public BillingLedgerResponse restorePayment(Long paymentId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        PaymentHistory payment = paymentHistoryRepository.findByIdAndTenantId(paymentId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 수금 건입니다. id=" + paymentId));
        if (!payment.isReversed()) {
            throw new IllegalArgumentException("취소되지 않은 수금 건입니다.");
        }

        BillingLedger ledger = lockLedger(payment.getBillingLedger().getId());
        ledger.applyPayment(payment.getAmount());
        payment.markRestored();

        return new BillingLedgerResponse(ledger);
    }

    /**
     * [환불 완료 처리] 환불 대상 금액(과오납)을 실제 지급 후 마감한다.
     * 비관적 락으로 원장을 잠근 뒤 도메인 규칙(completeRefund)으로 잔액을 0원으로 정리하고 상태를 마감한다.
     * (이미 환불 완료됐거나 환불 대상이 없으면 도메인에서 예외 → 중복 처리 차단)
     */
    @Transactional
    public BillingLedgerResponse completeRefund(Long ledgerId) {
        BillingLedger ledger = lockLedger(ledgerId);
        ledger.completeRefund();
        return new BillingLedgerResponse(ledger);
    }

    /**
     * [납기일 변경] 정산서 화면에서 관리자가 개별 원장의 납기일을 직접 조정한다.
     * 취소/이월된 원장은 도메인 규칙(requireActive)이 막는다.
     */
    @Transactional
    public BillingLedgerResponse changeDueDate(Long ledgerId, java.time.LocalDate newDueDate) {
        BillingLedger ledger = lockLedger(ledgerId);
        ledger.changeDueDate(newDueDate);
        return new BillingLedgerResponse(ledger);
    }

    /**
     * [정산 일정 수정] 이미 만든 회차의 청구기간·기본 청구액을 관리자가 직접 고친다.
     * 자동 배치가 잘못 잡은 회차를 삭제 후 재생성 없이 그 자리에서 바로잡을 수 있게 한다.
     * 다른 회차와 겹치거나 비어도 막지 않고, 바로 앞/뒤 회차의 경계를 자동으로 맞춰
     * 이어붙인다(reconcileSchedulePlacement). 기간이 늘어나면 계약 종료일도 함께 확장한다
     * (createLedger와 동일 규칙 — 출고일 미정 계약은 그대로 미정 유지).
     *
     * [입금액 함께 처리] req.paidAmount가 오면 현재 입금 누계와의 차액만큼 실제 입금
     * 이력(PaymentHistory)을 남긴다 — recordPayment와 같은 원리를 한 트랜잭션 안에서
     * 처리해, 잔액이 남으면 자동으로 부분입금, 다 채우면 완납으로 상태가 바뀐다
     * (BillingLedger.recompute() 재사용, 별도 상태 전환 로직 불필요). 차액이 음수면
     * (=지금보다 입금액을 줄이려는 시도) 어떤 입금 건을 취소할지 특정할 수 없어 막는다.
     */
    @Transactional
    public BillingLedgerResponse editLedger(Long ledgerId, LedgerEditRequest req) {
        BillingLedger ledger = lockLedger(ledgerId);

        reconcileSchedulePlacement(ledger.getStorageOrder(), req.getPeriodStart(), req.getPeriodEnd(), ledgerId);

        ledger.reviseSchedule(req.getPeriodStart(), req.getPeriodEnd(), req.getBaseAmount());
        extendOrderPeriod(ledger.getStorageOrder(), ledger.getBillingPeriodEnd());

        if (req.getPaidAmount() != null) {
            if (req.getPaidAmount().signum() < 0) {
                throw new IllegalArgumentException("입금액은 0 이상이어야 합니다.");
            }
            BigDecimal delta = req.getPaidAmount().subtract(ledger.getPaidTotal());
            if (delta.signum() > 0) {
                Long userId = SecurityUtils.getCurrentUser().getUserId();
                PaymentHistory payment = new PaymentHistory(
                        ledger.getTenant(), ledger, delta, PaymentMethod.BANK_TRANSFER,
                        LocalDate.now(), "일정 수정에서 입금 처리", userId);
                paymentHistoryRepository.save(payment);
                ledger.applyPayment(delta);
            } else if (delta.signum() < 0) {
                throw new IllegalArgumentException(
                        "입금액을 지금보다 줄일 수 없습니다. 정산 관리 화면에서 해당 입금 건을 취소한 뒤 다시 시도하세요.");
            }
        }
        return new BillingLedgerResponse(ledger);
    }

    /**
     * [정산 기록 삭제] 실수로 생성됐거나 잘못된 원장을 화면에서 완전히 지운다.
     *
     * [하드가드] 실제 입금(수금) 흔적이 있거나 다음 원장으로 이월된 원장은 삭제를 막는다 —
     *   그 흔적을 지우면 실제로 주고받은 돈의 기록이 사라져 회계가 어긋난다. 그런 원장을
     *   정리하려면 먼저 수금 취소(reversePayment)로 흔적을 없앤 뒤 삭제해야 한다.
     *   조정(할인/가산) 이력은 막지 않는다 — 과거 데이터에 "청구 후 전액 할인으로 0원 처리"된
     *   회차가 많이 남아있는데(실제 돈은 안 오갔음), 이런 회차까지 막으면 정리를 못 한다.
     *   조정 이력은 원장과 함께 지워진다(하단 삭제 처리 참고).
     * 가드를 통과하면(실제 입금이 없는 원장) 하위 이력(수금·조정)까지 함께 지운다.
     */
    @Transactional
    public void deleteLedger(Long ledgerId) {
        BillingLedger ledger = lockLedger(ledgerId);
        if (ledger.getPaidTotal().signum() > 0) {
            throw new IllegalStateException("수금 내역이 있는 원장은 삭제할 수 없습니다. 먼저 수금을 취소한 뒤 다시 시도하세요.");
        }
        if (ledger.getStatus() == BillingStatus.CARRIED_OVER) {
            throw new IllegalStateException("이미 다음 원장으로 이월된 원장은 삭제할 수 없습니다.");
        }
        // [정산 스케줄 공백 메우기] 앞뒤에 다른 활성 회차가 둘 다 있는(=중간에 낀) 회차를 지우면
        // 그 사이에 정산 공백이 생긴다 — 막는 대신, 바로 앞 회차의 종료일을 바로 다음 회차의
        // 시작일 전날까지 늘려 자동으로 이어붙인다(금액은 손대지 않고 기간만 확장).
        // 맨 처음·맨 마지막 회차를 지울 때는(앞 또는 뒤가 없음) 채울 공백이 없으니 그대로 삭제.
        Long orderId = ledger.getStorageOrder().getId();
        List<BillingLedger> others = ledgerRepository.findByStorageOrderId(orderId).stream()
                .filter(l -> l.getStatus() != BillingStatus.CANCELED)
                .filter(l -> !l.getId().equals(ledger.getId()))
                .toList();
        BillingLedger prev = others.stream()
                .filter(l -> l.getBillingPeriodEnd().isBefore(ledger.getBillingPeriodStart()))
                .max(java.util.Comparator.comparing(BillingLedger::getBillingPeriodEnd))
                .orElse(null);
        BillingLedger next = others.stream()
                .filter(l -> l.getBillingPeriodStart().isAfter(ledger.getBillingPeriodEnd()))
                .min(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (prev != null && next != null) {
            BillingLedger prevLocked = lockLedger(prev.getId());
            prevLocked.reviseSchedule(
                    prevLocked.getBillingPeriodStart(),
                    next.getBillingPeriodStart().minusDays(1),
                    prevLocked.getBaseAmount());
        }
        paymentHistoryRepository.deleteByBillingLedgerId(ledger.getId());
        adjustmentRepository.deleteByBillingLedgerId(ledger.getId());
        ledgerRepository.delete(ledger);
    }

    // ===================== 조정/할인 =====================

    /** 수동 조정/할인 (사유 필수, 오딧 이력 기록) */
    @Transactional
    public BillingLedgerResponse applyAdjustment(Long ledgerId, AdjustmentRequest req) {
        BillingLedger ledger = lockLedger(ledgerId);
        Long userId = SecurityUtils.getCurrentUser().getUserId();

        BigDecimal signed = toSignedAmount(req.getType(), req.getAmount());

        BillingAdjustment adjustment = new BillingAdjustment(
                ledger.getTenant(), ledger, req.getType(), signed, req.getReason(), userId);
        adjustmentRepository.save(adjustment);

        ledger.applyAdjustment(signed);
        return new BillingLedgerResponse(ledger);
    }

    // ===================== 중도 출고 정산 =====================

    /** 중도 출고 정산 미리보기 (원장 변경 없음) */
    @Transactional(readOnly = true)
    public MidReleaseSettlementResponse previewMidRelease(Long ledgerId, MidReleaseRequest req) {
        BillingLedger ledger = getLedgerOrThrow(ledgerId);
        MidReleaseResult result = calcMidRelease(ledger, req.getActualEndDate());
        return new MidReleaseSettlementResponse(result, ledger);
    }

    /** 중도 출고 정산 확정 (환급→차감조정, 추가청구→가산조정으로 원장에 반영) */
    @Transactional
    public MidReleaseSettlementResponse applyMidRelease(Long ledgerId, MidReleaseRequest req) {
        BillingLedger ledger = lockLedger(ledgerId);
        return applyMidReleaseTo(ledger, req.getActualEndDate());
    }

    /**
     * [출고 정산 - 원장 재산정] 중도출고 소급 정산 시, 활성 원장의 보관기간 종료일을 실제 출고일로 마감하고
     * 기본 청구액(baseAmount)을 실사용 보관료로 재산정한다. → 정산 화면의 보관기간·보관료·미수금이 모두 일치.
     *
     *  · settledAmount(실사용 보관료: 일수 × 하루 보관료)를 그대로 원장 기본청구액으로 반영
     *  · settledAmount 가 없으면(소급 정산 미선택) 원장을 건드리지 않는다(no-op) — 기존 동작 유지
     *
     * @return 재산정된 실사용 보관료(계약 화면 반영용). 재산정하지 않았으면 null.
     */
    @Transactional
    public Integer settleReleaseForOrder(Long storageOrderId, LocalDate actualEndDate, BigDecimal settledAmount) {
        if (settledAmount == null) return null;   // 소급 정산 미선택 → 원장 변경 없음

        BillingLedger target = ledgerRepository.findByStorageOrderId(storageOrderId).stream()
                .filter(l -> l.getStatus() != BillingStatus.CANCELED
                        && l.getStatus() != BillingStatus.CARRIED_OVER)
                .filter(l -> !actualEndDate.isBefore(l.getBillingPeriodStart()))
                .max(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (target == null) return null;

        BillingLedger locked = lockLedger(target.getId());
        // 보관기간 종료일 = 실제 출고일(원장 종료일 초과 시 원장 종료일로 클램프)
        LocalDate effectiveEnd = actualEndDate.isAfter(locked.getBillingPeriodEnd())
                ? locked.getBillingPeriodEnd() : actualEndDate;
        BigDecimal newBase = MoneyPolicy.normalize(settledAmount);

        locked.reviseForMidRelease(effectiveEnd, newBase);
        return newBase.intValue();
    }

    /**
     * [출고 취소] 계약의 중도출고 소급 정산을 되돌린다.
     * 마지막 '출고취소' 이후 쌓인 '중도출고' 조정들의 순합을 구해 반대 부호 조정으로 상쇄한다.
     * (조정은 불변 이력이므로 삭제 대신 역조정을 추가 — 오딧 트레일 보존)
     */
    @Transactional
    public void reverseMidReleaseForOrder(Long storageOrderId) {
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        for (BillingLedger ledger : ledgerRepository.findByStorageOrderId(storageOrderId)) {
            if (ledger.getStatus() == BillingStatus.CANCELED) continue;
            BillingLedger locked = lockLedger(ledger.getId());

            // 1) [현행 방식] 중도출고 재산정(기간·기본액)을 원래대로 원복
            locked.restoreFromMidRelease();

            // 2) [레거시 호환] 예전 조정 기반 중도출고분이 남아 있으면 역조정으로 상쇄 (오딧 보존)
            BigDecimal net = BigDecimal.ZERO;
            for (BillingAdjustment adj : adjustmentRepository
                    .findByBillingLedgerIdAndTenantIdOrderByCreatedAtAsc(locked.getId(), locked.getTenant().getId())) {
                String reason = adj.getReason();
                if (reason == null) continue;
                if (reason.startsWith("출고취소")) {
                    net = BigDecimal.ZERO;            // 이전 정산은 이미 취소됨 → 리셋
                } else if (reason.startsWith("중도출고")) {
                    net = net.add(adj.getAmount());
                }
            }
            if (net.signum() != 0) {
                BigDecimal reverse = net.negate();
                adjustmentRepository.save(new BillingAdjustment(
                        locked.getTenant(), locked, AdjustmentType.CORRECTION, reverse, "출고취소 - 중도출고 정산 취소", userId));
                locked.applyAdjustment(reverse);
            }
        }
    }

    /** 중도출고 정산 코어 — 이미 잠근 원장에 환급(차감)/추가청구(가산)를 반영 */
    private MidReleaseSettlementResponse applyMidReleaseTo(BillingLedger ledger, LocalDate actualEndDate) {
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        MidReleaseResult result = calcMidRelease(ledger, actualEndDate);

        if (result.refundAmount().signum() > 0) {
            BigDecimal signed = result.refundAmount().negate();   // 환급 = 차감
            String reason = "중도출고 환급 (사용 " + result.effectiveEndDate() + "까지)";
            adjustmentRepository.save(new BillingAdjustment(
                    ledger.getTenant(), ledger, AdjustmentType.CORRECTION, signed, reason, userId));
            ledger.applyAdjustment(signed);
        } else if (result.additionalChargeAmount().signum() > 0) {
            BigDecimal signed = result.additionalChargeAmount();  // 추가청구 = 가산
            String reason = "중도출고 추가청구 (사용 " + result.effectiveEndDate() + "까지)";
            adjustmentRepository.save(new BillingAdjustment(
                    ledger.getTenant(), ledger, AdjustmentType.SURCHARGE, signed, reason, userId));
            ledger.applyAdjustment(signed);
        }
        return new MidReleaseSettlementResponse(result, ledger);
    }

    // ===================== 알림 발송 =====================

    /** 특정 원장 결제 안내 발송 */
    @Transactional
    public void sendPaymentRequest(Long ledgerId) {
        BillingLedger ledger = getLedgerOrThrow(ledgerId);
        publish(ledger, NotificationType.PAYMENT_REQUEST);
    }

    /** 미납(납기 경과 + 잔액>0) 원장 일괄 미납 촉구 발송. 발송 건수 반환 */
    @Transactional
    public int sendOverdueReminders() {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        List<BillingLedger> overdue = ledgerRepository.findOverdue(tenantId, LocalDate.now());
        for (BillingLedger ledger : overdue) {
            publish(ledger, NotificationType.OVERDUE_REMINDER);
        }
        return overdue.size();
    }

    // ===================== 조회 =====================

    @Transactional(readOnly = true)
    public BillingLedgerResponse getLedger(Long ledgerId) {
        return new BillingLedgerResponse(getLedgerOrThrow(ledgerId));
    }

    /** 원장 상세 (수금·조정 이력 포함) */
    @Transactional(readOnly = true)
    public BillingLedgerDetailResponse getLedgerDetail(Long ledgerId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        BillingLedger ledger = getLedgerOrThrow(ledgerId);   // 소유권 확인 포함
        List<PaymentHistory> payments = paymentHistoryRepository
                .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(ledgerId, tenantId);
        List<BillingAdjustment> adjustments = adjustmentRepository
                .findByBillingLedgerIdAndTenantIdOrderByCreatedAtAsc(ledgerId, tenantId);
        return new BillingLedgerDetailResponse(ledger, payments, adjustments);
    }

    @Transactional(readOnly = true)
    public Page<BillingLedgerResponse> listLedgers(LocalDate from, LocalDate to, Pageable pageable) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        // [기간 필터] 둘 다 있으면 인덱스 기반 겹침 조회, 아니면 전체 조회 (기존 동작 호환)
        Page<BillingLedger> page = (from != null && to != null)
                ? ledgerRepository.findByTenantIdAndPeriodOverlap(tenantId, from, to, pageable)
                : ledgerRepository.findByTenantId(tenantId, pageable);
        return page.map(BillingLedgerResponse::new);
    }

    /**
     * [월별 청구·수금 추이] 최근 N개월(기본 6, 최대 24) 집계를 연속 시리즈로 반환한다.
     * DB에서 GROUP BY로 합산하고(앱단 풀스캔 제거), 데이터 없는 달은 0으로 채워 차트가 끊기지 않게 한다.
     */
    @Transactional(readOnly = true)
    public List<MonthlyRevenueResponse> getMonthlyRevenue(int months) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        int m = Math.max(1, Math.min(months, 24));
        YearMonth end = YearMonth.now();
        YearMonth start = end.minusMonths(m - 1L);
        LocalDate from = start.atDay(1);
        LocalDate to = end.atEndOfMonth();

        // 빈 달까지 0으로 미리 채워 연속 시리즈 보장 (yyyy-MM → 응답)
        Map<String, MonthlyRevenueResponse> series = new LinkedHashMap<>();
        for (int i = 0; i < m; i++) {
            YearMonth ym = start.plusMonths(i);
            series.put(ym.toString(),
                    new MonthlyRevenueResponse(ym.toString(), ym.getMonthValue() + "월",
                            MoneyPolicy.ZERO, MoneyPolicy.ZERO));
        }
        for (Object[] row : ledgerRepository.aggregateMonthlyRevenue(tenantId, from, to)) {
            String ym = (String) row[0];
            MonthlyRevenueResponse r = series.get(ym);
            if (r == null) continue;
            r.setBilled(MoneyPolicy.normalize(new BigDecimal(row[1].toString())));
            r.setCollected(MoneyPolicy.normalize(new BigDecimal(row[2].toString())));
        }
        return new ArrayList<>(series.values());
    }

    @Transactional(readOnly = true)
    public List<PaymentHistoryResponse> getPayments(Long ledgerId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        getLedgerOrThrow(ledgerId);   // 소유권 확인
        return paymentHistoryRepository
                .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(ledgerId, tenantId)
                .stream().map(PaymentHistoryResponse::new).toList();
    }

    @Transactional(readOnly = true)
    public List<AdjustmentResponse> getAdjustments(Long ledgerId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        getLedgerOrThrow(ledgerId);   // 소유권 확인
        return adjustmentRepository
                .findByBillingLedgerIdAndTenantIdOrderByCreatedAtAsc(ledgerId, tenantId)
                .stream().map(AdjustmentResponse::new).toList();
    }

    // ===================== 내부 헬퍼 =====================

    /** [격리] 조회 전용 (락 없음) */
    private BillingLedger getLedgerOrThrow(Long ledgerId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return ledgerRepository.findByIdAndTenantId(ledgerId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 청구 원장입니다. id=" + ledgerId));
    }

    /** [동시성] 변경 전용 — 비관적 쓰기 락으로 원장 잠금 */
    private BillingLedger lockLedger(Long ledgerId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return ledgerRepository.findForUpdate(ledgerId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 청구 원장입니다. id=" + ledgerId));
    }

    /**
     * [정산 스케줄 정합성 자동 보정] 회차를 만들거나 고칠 때 바로 앞/뒤 활성 회차와
     * 어긋나면(겹치거나 비면) "이미 기간이 겹칩니다" 같은 에러로 막는 대신, 그 이웃 회차의
     * 경계를 자동으로 맞춰 이어붙인다.
     *  - 이 회차의 시작일이 당겨지거나 밀리면 → 이전 회차의 종료일을 "이 회차 시작일 - 1일"로.
     *  - 이 회차의 종료일이 늘어나거나 줄면 → 다음 회차의 시작일을 "이 회차 종료일 + 1일"로.
     * 단, 그 보정으로 이웃 회차 자체가 뒤집혀버리는 경우(이웃을 통째로 삼키는 크기의 변경)는
     * 자동 보정 대상이 아니라 명확한 에러로 막는다 — 그 이웃 회차를 먼저 정리해야 한다.
     * 앞/뒤에 다른 회차가 아예 없으면(맨 처음·맨 마지막) 계약의 보관 시작일/실제 출고일과
     * 일치하는지만 검증한다(계약 경계는 자동 보정 대상이 아니라 사람이 명시적으로 맞춘다).
     * 관리자가 수동으로 만들거나(createLedger) 고칠 때(editLedger) 호출한다.
     */
    private void reconcileSchedulePlacement(StorageOrder order, LocalDate periodStart, LocalDate periodEnd,
                                             Long excludeLedgerId) {
        List<BillingLedger> active = ledgerRepository.findByStorageOrderId(order.getId()).stream()
                .filter(l -> l.getStatus() != BillingStatus.CANCELED)
                .filter(l -> excludeLedgerId == null || !l.getId().equals(excludeLedgerId))
                .toList();

        BillingLedger prev = active.stream()
                .filter(l -> l.getBillingPeriodStart().isBefore(periodStart))
                .max(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (prev != null) {
            LocalDate newPrevEnd = periodStart.minusDays(1);
            if (!prev.getBillingPeriodEnd().equals(newPrevEnd)) {
                if (newPrevEnd.isBefore(prev.getBillingPeriodStart())) {
                    throw new IllegalArgumentException(
                            "이전 회차(" + prev.getBillingPeriodStart() + "~" + prev.getBillingPeriodEnd()
                                    + ")를 완전히 덮어써서 처리할 수 없습니다. 이전 회차를 먼저 정리하세요.");
                }
                BillingLedger prevLocked = lockLedger(prev.getId());
                prevLocked.reviseSchedule(prevLocked.getBillingPeriodStart(), newPrevEnd, prevLocked.getBaseAmount());
            }
        } else if (!periodStart.equals(order.getStorageStartDate())) {
            throw new IllegalArgumentException(
                    "첫 회차 시작일은 계약의 보관 시작일(" + order.getStorageStartDate() + ")과 같아야 합니다.");
        }

        BillingLedger next = active.stream()
                .filter(l -> l.getBillingPeriodStart().isAfter(periodStart))
                .min(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (next != null) {
            LocalDate newNextStart = periodEnd.plusDays(1);
            if (!next.getBillingPeriodStart().equals(newNextStart)) {
                if (newNextStart.isAfter(next.getBillingPeriodEnd())) {
                    throw new IllegalArgumentException(
                            "다음 회차(" + next.getBillingPeriodStart() + "~" + next.getBillingPeriodEnd()
                                    + ")를 완전히 덮어써서 처리할 수 없습니다. 다음 회차를 먼저 정리하세요.");
                }
                BillingLedger nextLocked = lockLedger(next.getId());
                nextLocked.reviseSchedule(newNextStart, nextLocked.getBillingPeriodEnd(), nextLocked.getBaseAmount());
            }
        } else if (order.getActualEndDate() != null && !periodEnd.equals(order.getActualEndDate())) {
            throw new IllegalArgumentException(
                    "마지막 회차 종료일은 계약의 실제 출고일(" + order.getActualEndDate() + ")과 같아야 합니다.");
        }
    }

    private MidReleaseResult calcMidRelease(BillingLedger ledger, LocalDate actualEndDate) {
        BigDecimal monthlyFee = BigDecimal.valueOf(ledger.getStorageOrder().getMonthlyFee());
        return prorationCalculator.computeMidRelease(
                monthlyFee, ledger.getBaseAmount(),
                ledger.getBillingPeriodStart(), ledger.getBillingPeriodEnd(), actualEndDate);
    }

    private BigDecimal resolveBaseAmount(LedgerCreateRequest req, StorageOrder order) {
        if (req.getBaseAmount() != null) {
            return MoneyPolicy.normalize(req.getBaseAmount());
        }
        if (req.getBillingType() == BillingType.MONTHLY) {
            BigDecimal monthlyFee = BigDecimal.valueOf(order.getMonthlyFee());
            return prorationCalculator.prorateMonthly(monthlyFee, req.getPeriodStart(), req.getPeriodEnd());
        }
        // DAILY: 일 단가 필요
        if (req.getDailyRate() == null) {
            throw new IllegalArgumentException("일 단위 계약은 dailyRate 또는 baseAmount가 필요합니다.");
        }
        return prorationCalculator.prorateDaily(req.getDailyRate(), req.getPeriodStart(), req.getPeriodEnd());
    }

    /** 조정 유형에 따라 부호 결정 */
    private BigDecimal toSignedAmount(AdjustmentType type, BigDecimal amount) {
        BigDecimal magnitude = amount.abs();
        return switch (type) {
            case DISCOUNT, WRITE_OFF -> magnitude.negate();  // 차감
            case SURCHARGE -> magnitude;                     // 가산
            case CORRECTION -> amount;                       // 입력 부호 그대로
        };
    }

    private void publish(BillingLedger ledger, NotificationType type) {
        BillingNotification notification = new BillingNotification(
                ledger.getTenant().getId(),
                ledger.getId(),
                ledger.getLedgerNo(),
                type,
                ledger.getCustomer().getName(),
                ledger.getCustomer().getPhoneNumber(),
                ledger.getBalance(),
                ledger.getDueDate());
        eventPublisher.publishEvent(new BillingNotificationEvent(notification));
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
