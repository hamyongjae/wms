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
import java.time.format.DateTimeFormatter;
import java.util.List;

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

    /** 청구 원장 생성 (일할 계산 반영, DRAFT 상태) */
    @Transactional
    public BillingLedgerResponse createLedger(LedgerCreateRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        StorageOrder order = storageOrderRepository
                .findByIdAndTenantId(req.getStorageOrderId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 계약입니다. id=" + req.getStorageOrderId()));

        BigDecimal baseAmount = resolveBaseAmount(req, order);
        BigDecimal carriedOverIn = MoneyPolicy.nvl(req.getCarriedOverIn());

        Tenant tenant = order.getTenant();
        Customer customer = order.getCustomer();

        BillingLedger ledger = new BillingLedger(
                tenant, order, customer, generateLedgerNo(),
                req.getBillingType(), req.getSettlementType(),
                req.getPeriodStart(), req.getPeriodEnd(),
                baseAmount, carriedOverIn, req.getDueDate());

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
        if (current == null || periodEnd.isAfter(current)) {
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
     */
    @Transactional
    public void settlePrepaid(StorageOrder order, LocalDate periodStart, LocalDate periodEnd, BigDecimal amount) {
        BigDecimal base = MoneyPolicy.normalize(amount);
        BillingLedger ledger = new BillingLedger(
                order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                BillingType.MONTHLY, SettlementType.PREPAID,
                periodStart, periodEnd, base, BigDecimal.ZERO, periodStart);

        ledger.issue(periodStart);              // DRAFT → ISSUED (납기 = 입고일)
        ledgerRepository.save(ledger);

        Long userId = SecurityUtils.getCurrentUser().getUserId();
        paymentHistoryRepository.save(new PaymentHistory(
                order.getTenant(), ledger, base, PaymentMethod.BANK_TRANSFER,
                periodStart, "선불 계약 - 자동 처리", userId));
        ledger.applyPayment(base);              // 전액 수금 → PAID
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

    // ===================== 미수금 차월 이월 =====================

    /** 남은 미수금을 차월 원장으로 이월하고 현재 원장 마감 */
    @Transactional
    public BillingLedgerResponse carryOverToNext(Long ledgerId, CarryOverRequest req) {
        BillingLedger current = lockLedger(ledgerId);

        BigDecimal outstanding = current.outstandingBalance();
        if (outstanding.signum() <= 0) {
            throw new IllegalStateException("이월할 미수금이 없습니다. 잔액=" + current.getBalance());
        }

        StorageOrder order = current.getStorageOrder();
        BigDecimal nextBase = resolveNextBaseAmount(req, current, order);

        BillingLedger next = new BillingLedger(
                current.getTenant(), order, current.getCustomer(), generateLedgerNo(),
                current.getBillingType(), current.getSettlementType(),
                req.getNextPeriodStart(), req.getNextPeriodEnd(),
                nextBase, outstanding, req.getNextDueDate());
        // 이월 원장은 바로 발행 상태로 (미수금이 살아있어야 하므로)
        next.issue(req.getNextDueDate());
        BillingLedger savedNext = ledgerRepository.save(next);

        current.carryOverTo(savedNext);
        // [보관기간 동기화] 이월(연장) 회차 종료일까지 계약 보관기간 확장
        extendOrderPeriod(order, req.getNextPeriodEnd());
        return new BillingLedgerResponse(savedNext);
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
     * [계약 출고 연동] 특정 계약의 활성 원장에 중도출고 소급 정산을 적용한다.
     * 상태 변경(출고 처리)에서 '보관료 소급' 선택 시 호출된다. 적용 대상 원장이 없으면 no-op.
     */
    @Transactional
    public void settleMidReleaseForOrder(Long storageOrderId, LocalDate actualEndDate) {
        // 취소 아님 + 실제 출고일이 청구 시작일 이후인 원장 중 가장 늦은 회차를 정산 대상으로
        BillingLedger target = ledgerRepository.findByStorageOrderId(storageOrderId).stream()
                .filter(l -> l.getStatus() != BillingStatus.CANCELED)
                .filter(l -> !actualEndDate.isBefore(l.getBillingPeriodStart()))
                .max(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (target == null) return;
        BillingLedger locked = lockLedger(target.getId());
        applyMidReleaseTo(locked, actualEndDate);
    }

    /**
     * [수동 정산] 사용자가 입력한 실사용 보관료로 원장을 정산한다.
     * 대상 원장의 기본 보관료(baseAmount)를 settledAmount가 되도록 CORRECTION 조정을 반영.
     */
    @Transactional
    public void settleManualForOrder(Long storageOrderId, BigDecimal settledAmount) {
        if (settledAmount == null) return;
        BillingLedger target = ledgerRepository.findByStorageOrderId(storageOrderId).stream()
                .filter(l -> l.getStatus() != BillingStatus.CANCELED)
                .max(java.util.Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .orElse(null);
        if (target == null) return;
        BillingLedger locked = lockLedger(target.getId());
        BigDecimal settled = MoneyPolicy.normalize(settledAmount);
        BigDecimal diff = settled.subtract(locked.getBaseAmount());
        if (diff.signum() == 0) return;
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        String reason = "중도출고 실사용 보관료 정산 (" + settled.toBigInteger() + "원)";
        adjustmentRepository.save(new BillingAdjustment(
                locked.getTenant(), locked, AdjustmentType.CORRECTION, diff, reason, userId));
        locked.applyAdjustment(diff);
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
            BigDecimal net = BigDecimal.ZERO;
            for (BillingAdjustment adj : adjustmentRepository
                    .findByBillingLedgerIdAndTenantIdOrderByCreatedAtAsc(ledger.getId(), ledger.getTenant().getId())) {
                String reason = adj.getReason();
                if (reason == null) continue;
                if (reason.startsWith("출고취소")) {
                    net = BigDecimal.ZERO;            // 이전 정산은 이미 취소됨 → 리셋
                } else if (reason.startsWith("중도출고")) {
                    net = net.add(adj.getAmount());
                }
            }
            if (net.signum() != 0) {
                BillingLedger locked = lockLedger(ledger.getId());
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

    private BigDecimal resolveNextBaseAmount(CarryOverRequest req, BillingLedger current, StorageOrder order) {
        if (req.getNextBaseAmount() != null) {
            return MoneyPolicy.normalize(req.getNextBaseAmount());
        }
        if (current.getBillingType() == BillingType.MONTHLY) {
            BigDecimal monthlyFee = BigDecimal.valueOf(order.getMonthlyFee());
            return prorationCalculator.prorateMonthly(
                    monthlyFee, req.getNextPeriodStart(), req.getNextPeriodEnd());
        }
        throw new IllegalArgumentException("일 단위 계약은 차월 기본액(nextBaseAmount)을 직접 지정하세요.");
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
