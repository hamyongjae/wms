package com.example.wms.billing.entity;

import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.tenant.entity.Tenant;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 청구 조정/할인 이력 (오딧 트레일).
 *
 * 관리자가 단골 할인, 연체 가산, 대손 상각, 오기입 정정 등을 할 때마다
 * "부호 있는 금액 + 사유"를 불변 이력으로 남긴다.
 * (할인/상각은 음수, 가산은 양수)
 */
@Entity
@Table(name = "billing_adjustments",
        indexes = {
                @Index(name = "idx_adjust_tenant", columnList = "tenant_id"),
                @Index(name = "idx_adjust_ledger", columnList = "billing_ledger_id")
        })
@Getter
@NoArgsConstructor
public class BillingAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "billing_ledger_id", nullable = false)
    private BillingLedger billingLedger;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private AdjustmentType type;

    @Column(name = "amount", nullable = false, precision = 19, scale = 2)
    private BigDecimal amount;         // 부호 있는 금액 (할인/상각=음수, 가산=양수)

    @Column(name = "reason", nullable = false, length = 500)
    private String reason;             // 오딧용 사유 (필수)

    // ===== 오딧 =====
    @Column(name = "performed_by_user_id", nullable = false)
    private Long performedByUserId;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public BillingAdjustment(Tenant tenant, BillingLedger billingLedger, AdjustmentType type,
                             BigDecimal amount, String reason, Long performedByUserId) {
        this.tenant = tenant;
        this.billingLedger = billingLedger;
        this.type = type;
        this.amount = MoneyPolicy.normalize(amount);
        this.reason = reason;
        this.performedByUserId = performedByUserId;
    }
}
