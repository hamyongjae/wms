package com.example.wms.billing.entity;

import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import jakarta.persistence.*;
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
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
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

    // ===== 이월 링크 =====
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carried_over_to_ledger_id")
    private BillingLedger carriedOverToLedger;   // 이 원장의 잔액이 넘어간 다음 원장

    // ===== 상태 =====
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private BillingStatus status;

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

    /** 취소 */
    public void cancel() {
        if (this.status == BillingStatus.PAID || this.status == BillingStatus.CARRIED_OVER) {
            throw new IllegalStateException("완납/이월된 원장은 취소할 수 없습니다. 현재=" + status);
        }
        this.status = BillingStatus.CANCELED;
    }

    /** 남은 미수금(이월 대상 금액) */
    public BigDecimal outstandingBalance() {
        return this.balance.signum() > 0 ? this.balance : MoneyPolicy.ZERO;
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
