package com.example.wms.order.entity;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.customer.entity.Customer;
import com.example.wms.warehouse.entity.Warehouse;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 보관 계약.
 *
 * [단순 이진 상태 모델]
 * 복잡한 다중 상태(입고예정/보관중/출고예정)를 제거하고
 * INBOUND(입고) / OUTBOUND(출고) 두 가지로만 흐름을 제어한다.
 *
 * - 신규 계약: INBOUND (기본값)
 * - 출고 처리: OUTBOUND (실제 출고일 기록)
 * - 상태는 오직 관리자의 명시적 토글로만 전환 (시간 기반 자동 전이 없음)
 */
@Entity
@Table(name = "storage_orders")
@Getter
@Setter
@NoArgsConstructor
public class StorageOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ===== 관계 =====
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
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    // ===== 상태 (입고/출고 이진) =====
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrderStatus status = OrderStatus.INBOUND;

    // ===== 청구 조건 (선불/후불 · 납기일) — 계약이 자기 청구 조건을 기억한다 =====
    // [스키마] 기존 행 호환을 위해 nullable. 수정 시 이 값 기준으로 활성 원장을 재정산한다.
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_type", length = 20)
    private com.example.wms.billing.entity.SettlementType paymentType;   // 선불(PREPAID)/후불(POSTPAID)

    @Column(name = "due_date")
    private LocalDate dueDate;                // 납기일 (청구 대금 회수 기준일)

    // 매월 반복 청구 원장 자동 생성 여부 — false(수동)면 BillingBatchService의 월간 배치 대상에서 제외된다.
    // [스키마] 기존 행 호환을 위해 DB 기본값 true(기존 전원 자동 생성 동작 보존). 등록 시 최초 청구서는 이 값과 무관하게 항상 자동 발행된다.
    @Column(name = "auto_billing_enabled", nullable = false, columnDefinition = "boolean default true")
    private Boolean autoBillingEnabled = true;

    // 정산서 자동 생성 주기(개월) — autoBillingEnabled가 true일 때만 의미가 있다(수동이면 배치 대상이
    // 아니라 아예 안 쓰임). BillingBatchService가 매 회차마다 이 개월 수만큼 기간을 잡아 생성한다.
    // [스키마] 기존 행 호환을 위해 DB 기본값 1(기존 전원 1개월 주기 동작 보존).
    @Column(name = "billing_cycle_months", nullable = false, columnDefinition = "integer default 1")
    private Integer billingCycleMonths = 1;

    // ===== 결제 수단 & 수납 담당(계좌 연동) =====
    // [스키마] 기존 행 호환을 위해 nullable — 신규 계약은 아래 기본값(계좌이체)으로 저장된다.
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", length = 20)
    private com.example.wms.billing.entity.PaymentMethod paymentMethod =
            com.example.wms.billing.entity.PaymentMethod.BANK_TRANSFER;

    // 계좌이체 시 수납 계좌를 참조할 담당 직원 (Lazy — 목록 조회 시 조인 오버헤드 없음)
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "settlement_user_id")
    private com.example.wms.user.entity.User settlementUser;

    // ===== 기간 =====
    @Column(name = "storage_start_date", nullable = false)
    private LocalDate storageStartDate;      // 입고일

    @Column(name = "expected_end_date")
    private LocalDate expectedEndDate;       // 출고 예정일

    @Column(name = "actual_end_date")
    private LocalDate actualEndDate;         // 실제 출고일

    // ===== 출고 취소(소급 복구)용 스냅샷 =====
    @Column(name = "original_end_date")
    private LocalDate originalEndDate;       // 출고 전 보관 종료일 (롤백용)

    @Column(name = "original_monthly_fee")
    private Integer originalMonthlyFee;      // 출고 전 보관료 (롤백용)

    // ===== 금액·물량 =====
    @Column(name = "monthly_fee", nullable = false)
    private Integer monthlyFee;              // 월 보관료

    @Column(name = "capacity_tons")
    private Double capacityTons;             // 보관 용량(톤)

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;

    // ===== 시스템 공통 =====
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ===== 생성자 =====
    public StorageOrder(Tenant tenant, Customer customer, Warehouse warehouse,
                        LocalDate storageStartDate, LocalDate expectedEndDate,
                        Integer monthlyFee, Double capacityTons, String memo) {
        this.tenant = tenant;
        this.customer = customer;
        this.warehouse = warehouse;
        this.storageStartDate = storageStartDate;
        this.expectedEndDate = expectedEndDate;
        this.monthlyFee = monthlyFee;
        this.capacityTons = capacityTons;
        this.memo = memo;
        this.status = OrderStatus.INBOUND;   // 신규 계약은 입고 상태로 시작
    }

    // ===== 정보 수정 (보관 시작일까지 편집 허용) =====
    public void updateInfo(LocalDate storageStartDate, LocalDate expectedEndDate, Integer monthlyFee,
                           Double capacityTons, String memo) {
        if (storageStartDate != null) {
            this.storageStartDate = storageStartDate;
        }
        this.expectedEndDate = expectedEndDate;
        this.monthlyFee = monthlyFee;
        this.capacityTons = capacityTons;
        this.memo = memo;
    }

    // ===== [출고 마감] 입고 → 출고: 실제 출고일로 보관 종료일을 마감(override) =====
    /**
     * 실제 출고일을 기록하며 보관 종료일(expectedEndDate)을 그 날짜로 강제 마감한다.
     * 롤백을 위해 마감 전 종료일·보관료를 스냅샷으로 보존한다.
     *
     * [이중 출고 방어] INBOUND에서만 호출 가능하다. 이미 OUTBOUND인 계약에 다시 호출되면(중복
     * 요청·재시도 등) 이미 마감된 값을 "원래 값"으로 스냅샷해 버려, 이후 출고취소(unreleased)가
     * 진짜 원래 보관기간·보관료가 아니라 잘못된 값으로 복구되는 사고로 이어진다.
     */
    public void release(LocalDate actualEndDate) {
        if (this.status != OrderStatus.INBOUND) {
            throw new IllegalStateException("출고 처리는 입고(INBOUND) 상태에서만 가능합니다. 현재=" + status);
        }
        this.originalEndDate = this.expectedEndDate;   // 롤백 스냅샷
        this.originalMonthlyFee = this.monthlyFee;
        this.status = OrderStatus.OUTBOUND;
        this.actualEndDate = actualEndDate;
        this.expectedEndDate = actualEndDate;          // 보관 종료일 자동 마감
    }

    // 출고 소급 정산으로 확정된 실사용 보관료를 반영 (원장 정산과 함께 호출)
    public void applySettledFee(Integer fee) {
        this.monthlyFee = fee;
    }

    // ===== [출고 취소] 출고 → 입고: 마감 전 상태로 소급 복구 =====
    public void unreleased() {
        this.status = OrderStatus.INBOUND;
        this.actualEndDate = null;
        if (this.originalEndDate != null) {
            this.expectedEndDate = this.originalEndDate;   // 보관 종료일 롤백
            this.originalEndDate = null;
        }
        if (this.originalMonthlyFee != null) {
            this.monthlyFee = this.originalMonthlyFee;      // 보관료 롤백
            this.originalMonthlyFee = null;
        }
    }

    // ===== 편의 판별 =====
    public boolean isInbound() {
        return this.status == OrderStatus.INBOUND;
    }

    public boolean isOutbound() {
        return this.status == OrderStatus.OUTBOUND;
    }
}
