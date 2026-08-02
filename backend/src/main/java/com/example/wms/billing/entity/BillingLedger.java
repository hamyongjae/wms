package com.example.wms.billing.entity;

import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 청구 원장 (한 계약의 한 청구 주기 = 한 장부).
 *
 * [잔액 공식]
 *   잔액 = 기본청구액(baseAmount) + 전월이월(carriedOverIn)
 *          + 조정누계(adjustmentTotal, 할인은 음수) - 수금누계(paidTotal)
 *
 * [동시성] @Version 낙관적 락으로 "사장님이 두 창에서 동시에 수금 처리" 같은
 *   갱신 유실을 감지한다. 수금/조정 같은 임계 구간은 서비스에서 비관적 락도 함께 사용.
 */
@Entity
@Table(name = "billing_ledgers",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_billing_ledger_no", columnNames = "ledger_no"),
        indexes = {
                @Index(name = "idx_ledger_tenant", columnList = "tenant_id"),
                @Index(name = "idx_ledger_order", columnList = "storage_order_id"),
                // [기간 조회] tenant + 청구 시작일 복합 인덱스 — 월별/기간별 조회가 인덱스를 타도록
                @Index(name = "idx_ledger_tenant_period", columnList = "tenant_id, period_start")
        })
@Getter
@NoArgsConstructor
public class BillingLedger {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ===== 테넌트 격리 =====
    /**
     * [테넌트 격리] Hibernate 가 모든 조회에 {@code tenant_id = ?} 를 자동으로 덧붙이고,
     * 저장 시에는 현재 컨텍스트의 업체 id 를 자동으로 채운다.
     * 아래 tenant 연관관계는 같은 컬럼을 읽기 전용으로 바라본다(쓰기 주체는 이 필드 하나뿐).
     */
    @TenantId
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;

    // ===== 대상 계약/고객 =====
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "storage_order_id", nullable = false)
    private StorageOrder storageOrder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @Column(name = "ledger_no", nullable = false, length = 50)
    private String ledgerNo;   // 청구번호 (자동 생성)

    // ===== 청구 조건 =====
    @Enumerated(EnumType.STRING)
    @Column(name = "billing_type", nullable = false, length = 20)
    private BillingType billingType;

    @Enumerated(EnumType.STRING)
    @Column(name = "settlement_type", nullable = false, length = 20)
    private SettlementType settlementType;

    @Column(name = "period_start", nullable = false)
    private LocalDate billingPeriodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate billingPeriodEnd;

    @Column(name = "due_date")
    private LocalDate dueDate;

    // ===== 금액 (모두 BigDecimal, NUMERIC(19,2)) =====
    @Column(name = "base_amount", nullable = false, precision = 19, scale = 2)
    private BigDecimal baseAmount;

    @Column(name = "carried_over_in", nullable = false, precision = 19, scale = 2)
    private BigDecimal carriedOverIn;      // 전월(이전 원장)에서 넘어온 미수금

    @Column(name = "adjustment_total", nullable = false, precision = 19, scale = 2)
    private BigDecimal adjustmentTotal;    // 조정 누계 (할인=음수)

    @Column(name = "paid_total", nullable = false, precision = 19, scale = 2)
    private BigDecimal paidTotal;          // 수금 누계

    @Column(name = "balance", nullable = false, precision = 19, scale = 2)
    private BigDecimal balance;            // 잔액(미수금). 파생값이지만 조회 성능 위해 저장

    // ===== 중도출고 재산정용 스냅샷 (출고취소 시 원복) =====
    @Column(name = "original_period_end")
    private LocalDate originalPeriodEnd;         // 중도출고 전 보관기간 종료일

    @Column(name = "original_base_amount", precision = 19, scale = 2)
    private BigDecimal originalBaseAmount;       // 중도출고 전 기본 청구액

    // ===== 이월 링크 =====
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carried_over_to_ledger_id")
    private BillingLedger carriedOverToLedger;   // 이 원장의 잔액이 넘어간 다음 원장

    // ===== 상태 =====
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private BillingStatus status;

    // [환불 완료] 환불 대상 금액을 실제 지급하고 마감한 시각. null이면 '환불 대기'.
    @Column(name = "refunded_at")
    private LocalDateTime refundedAt;

    // ===== 수금/조정 이력 (읽기용 뷰) =====
    @OneToMany(mappedBy = "billingLedger", fetch = FetchType.LAZY)
    private List<PaymentHistory> payments = new ArrayList<>();

    @OneToMany(mappedBy = "billingLedger", fetch = FetchType.LAZY)
    private List<BillingAdjustment> adjustments = new ArrayList<>();

    // ===== 동시성 & Auditing =====
    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ===== 생성자 =====
    public BillingLedger(Tenant tenant, StorageOrder storageOrder, Customer customer,
                         String ledgerNo, BillingType billingType, SettlementType settlementType,
                         LocalDate billingPeriodStart, LocalDate billingPeriodEnd,
                         BigDecimal baseAmount, BigDecimal carriedOverIn, LocalDate dueDate) {
        this.tenant = tenant;
        this.storageOrder = storageOrder;
        this.customer = customer;
        this.ledgerNo = ledgerNo;
        this.billingType = billingType;
        this.settlementType = settlementType;
        this.billingPeriodStart = billingPeriodStart;
        this.billingPeriodEnd = billingPeriodEnd;
        this.dueDate = dueDate;
        this.baseAmount = MoneyPolicy.normalize(baseAmount);
        this.carriedOverIn = MoneyPolicy.normalize(carriedOverIn);
        this.adjustmentTotal = MoneyPolicy.ZERO;
        this.paidTotal = MoneyPolicy.ZERO;
        this.status = BillingStatus.DRAFT;
        recompute();
    }

    // ===== 상태 변경 메서드 (도메인 규칙 캡슐화) =====

    /** 발행: DRAFT → ISSUED (청구 확정) */
    public void issue(LocalDate dueDate) {
        if (this.status != BillingStatus.DRAFT) {
            throw new IllegalStateException("발행은 작성중(DRAFT) 원장에서만 가능합니다. 현재=" + status);
        }
        this.dueDate = dueDate;
        this.status = BillingStatus.ISSUED;
        recompute();
    }

    /** 부분 수금 반영 (양수만 허용) */
    public void applyPayment(BigDecimal amount) {
        requirePositive(amount, "수금액");
        requireActive();
        this.paidTotal = MoneyPolicy.normalize(this.paidTotal.add(amount));
        recompute();
    }

    /** 수금 취소/정정용 차감 (환불 등). 결과가 음수가 되지 않도록 방지 */
    public void reversePayment(BigDecimal amount) {
        requirePositive(amount, "취소 수금액");
        BigDecimal next = this.paidTotal.subtract(amount);
        if (next.signum() < 0) {
            throw new IllegalArgumentException("취소 금액이 누적 수금액을 초과합니다.");
        }
        this.paidTotal = MoneyPolicy.normalize(next);
        recompute();
    }

    /** 조정/할인 반영 (할인·상각=음수, 가산=양수) */
    public void applyAdjustment(BigDecimal signedAmount) {
        if (signedAmount == null || signedAmount.signum() == 0) {
            throw new IllegalArgumentException("조정 금액은 0이 될 수 없습니다.");
        }
        requireActive();
        this.adjustmentTotal = MoneyPolicy.normalize(this.adjustmentTotal.add(signedAmount));
        recompute();
    }

    /** 잔액을 다음 원장으로 이월하고 이 원장을 마감 */
    public void carryOverTo(BillingLedger nextLedger) {
        requireActive();
        this.carriedOverToLedger = nextLedger;
        this.status = BillingStatus.CARRIED_OVER;
    }

    /**
     * [중도출고 재산정] 보관기간 종료일을 실제 출고일로 앞당기고, 기본 청구액을 실사용분으로 재산정한다.
     * 출고취소 롤백을 위해 최초 1회 원래 종료일·기본액을 스냅샷으로 보존한다.
     * (기간·기본액이 함께 실사용 기준으로 바뀌므로 정산 화면의 보관기간·보관료·미수금이 모두 일치)
     */
    public void reviseForMidRelease(LocalDate effectiveEnd, BigDecimal proratedBase) {
        requireActive();
        if (effectiveEnd == null || effectiveEnd.isBefore(billingPeriodStart)) {
            throw new IllegalArgumentException("실사용 종료일이 청구 시작일보다 앞설 수 없습니다.");
        }
        if (this.originalPeriodEnd == null) {           // 최초 재산정 시에만 스냅샷
            this.originalPeriodEnd = this.billingPeriodEnd;
            this.originalBaseAmount = this.baseAmount;
        }
        this.billingPeriodEnd = effectiveEnd;
        this.baseAmount = MoneyPolicy.normalize(proratedBase);
        recompute();
    }

    /** [출고취소] 중도출고 재산정 전 보관기간·기본액으로 원복 */
    public void restoreFromMidRelease() {
        if (this.originalPeriodEnd == null) return;     // 재산정된 적 없음
        this.billingPeriodEnd = this.originalPeriodEnd;
        this.baseAmount = this.originalBaseAmount;
        this.originalPeriodEnd = null;
        this.originalBaseAmount = null;
        recompute();
    }

    /** 납기일 변경 (계약 수정에서 청구 조건 재정렬 시) */
    public void changeDueDate(LocalDate dueDate) {
        requireActive();
        this.dueDate = dueDate;
    }

    /** 정산 방식(선불/후불) 변경 (계약 수정에서 결제 방식 전환 시). 수금 반영은 서비스에서 별도 처리 */
    public void changeSettlementType(SettlementType settlementType) {
        requireActive();
        this.settlementType = settlementType;
    }

    /** 취소 */
    public void cancel() {
        if (this.status == BillingStatus.PAID || this.status == BillingStatus.CARRIED_OVER) {
            throw new IllegalStateException("완납/이월된 원장은 취소할 수 없습니다. 현재=" + status);
        }
        this.status = BillingStatus.CANCELED;
    }

    /** 남은 미수금(이월 대상 금액) — 잔액이 양수일 때만. 과오납(음수)은 미수금이 아니다. */
    public BigDecimal outstandingBalance() {
        return this.balance.signum() > 0 ? this.balance : MoneyPolicy.ZERO;
    }

    /**
     * [환불 대상 금액 - 계정 과목 분리] 중도출고 등으로 실청구액이 수금액보다 작아져 잔액이 음수가 되면,
     * 그 절대값을 '환불(선급금 반환) 대상'으로 본다. 미수금(outstandingBalance)과 명확히 분리한다.
     * (선불 완납 계약의 중도출고 환급, 후불 과오납 환불 모두 부호로 자연스럽게 판별)
     */
    public BigDecimal refundDue() {
        return this.balance.signum() < 0 ? this.balance.negate() : MoneyPolicy.ZERO;
    }

    /** 환불 완료 여부 (실제 지급 후 마감되었는지) */
    public boolean isRefundCompleted() {
        return this.refundedAt != null;
    }

    /**
     * [환불 완료 처리] 환불 대상 금액을 실제 지급했음을 확정하고 원장을 마감한다.
     *  · 과오납분(refundDue)만큼 수금 누계를 차감 → 잔액을 0원으로 정리하고 상태를 완납(정산 마감)으로 전이
     *  · 환불 완료 시각을 기록해 '환불 대기 → 환불 완료' 상태를 표현
     *  [이중 방어] 이미 환불 완료됐거나 환불 대상 금액이 없으면 예외 — 중복/무효 처리 차단
     */
    public void completeRefund() {
        if (this.refundedAt != null) {
            throw new IllegalStateException("이미 환불 완료 처리된 원장입니다.");
        }
        if (this.status == BillingStatus.CANCELED || this.status == BillingStatus.CARRIED_OVER) {
            throw new IllegalStateException("취소/이월된 원장은 환불 처리할 수 없습니다. 현재=" + status);
        }
        BigDecimal refund = refundDue();
        if (refund.signum() <= 0) {
            throw new IllegalStateException("환불 대상 금액이 없습니다. 현재 잔액=" + balance);
        }
        // 과오납분을 실제 환급 → 순수금액에서 차감하여 잔액 0 마감
        this.paidTotal = MoneyPolicy.normalize(this.paidTotal.subtract(refund));
        this.refundedAt = LocalDateTime.now();
        recompute();   // balance → 0, 상태 → PAID(정산 마감)
    }

    // ===== 내부 =====

    /** 잔액 재계산 + 상태 자동 전이 */
    private void recompute() {
        this.balance = MoneyPolicy.normalize(
                baseAmount.add(carriedOverIn).add(adjustmentTotal).subtract(paidTotal));

        // 이 상태들은 자동 전이 대상이 아님
        if (status == BillingStatus.DRAFT
                || status == BillingStatus.CANCELED
                || status == BillingStatus.CARRIED_OVER) {
            return;
        }
        if (balance.signum() <= 0) {
            this.status = BillingStatus.PAID;
        } else if (paidTotal.signum() > 0) {
            this.status = BillingStatus.PARTIALLY_PAID;
        } else {
            this.status = BillingStatus.ISSUED;
        }
    }

    private void requireActive() {
        if (status == BillingStatus.CANCELED || status == BillingStatus.CARRIED_OVER) {
            throw new IllegalStateException("취소/이월된 원장은 변경할 수 없습니다. 현재=" + status);
        }
    }

    private void requirePositive(BigDecimal amount, String label) {
        if (amount == null || amount.signum() <= 0) {
            throw new IllegalArgumentException(label + "은(는) 0보다 커야 합니다.");
        }
    }
}
