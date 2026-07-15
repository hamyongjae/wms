package com.example.wms.billing.entity;

import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.tenant.entity.Tenant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 수금 이력 (하나의 청구 원장에 대해 여러 건 = 1:N).
 *
 * 사장님이 통장 입금 내역을 보고 수동으로 한 건씩 기록한다.
 * 각 건은 불변(수정 대신 취소 이력으로 관리)하며, 누가 처리했는지(performedByUserId)를
 * 남겨 오딧 트레일로 쓴다.
 */
@Entity
@Table(name = "payment_histories",
        indexes = {
                @Index(name = "idx_payment_tenant", columnList = "tenant_id"),
                @Index(name = "idx_payment_ledger", columnList = "billing_ledger_id")
        })
@Getter
@NoArgsConstructor
public class PaymentHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "billing_ledger_id", nullable = false)
    private BillingLedger billingLedger;

    @Column(name = "amount", nullable = false, precision = 19, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 20)
    private PaymentMethod method;

    @Column(name = "paid_on", nullable = false)
    private LocalDate paidOn;          // 실제 입금일 (통장 기준)

    @Column(name = "memo", length = 255)
    private String memo;

    @Column(name = "reversed", nullable = false)
    private boolean reversed;          // 취소된 수금 건인지

    // ===== 오딧 =====
    @Column(name = "performed_by_user_id", nullable = false)
    private Long performedByUserId;    // 처리자(로그인 사용자)

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public PaymentHistory(Tenant tenant, BillingLedger billingLedger, BigDecimal amount,
                          PaymentMethod method, LocalDate paidOn, String memo,
                          Long performedByUserId) {
        this.tenant = tenant;
        this.billingLedger = billingLedger;
        this.amount = MoneyPolicy.normalize(amount);
        this.method = method;
        this.paidOn = paidOn;
        this.memo = memo;
        this.performedByUserId = performedByUserId;
        this.reversed = false;
    }

    public void markReversed() {
        this.reversed = true;
    }
}
