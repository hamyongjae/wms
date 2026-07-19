package com.example.wms.order.entity;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.customer.entity.Customer;
import com.example.wms.warehouse.entity.Warehouse;

import jakarta.persistence.*;
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
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
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

    // ===== 금액·물량 =====
    @Column(name = "monthly_fee", nullable = false)
    private Integer monthlyFee;              // 월 보관료

    @Column(name = "total_volume")
    private Double totalVolume;              // 총 부피(㎥)

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
                        Integer monthlyFee, Double totalVolume, String memo) {
        this.tenant = tenant;
        this.customer = customer;
        this.warehouse = warehouse;
        this.storageStartDate = storageStartDate;
        this.expectedEndDate = expectedEndDate;
        this.monthlyFee = monthlyFee;
        this.totalVolume = totalVolume;
        this.memo = memo;
        this.status = OrderStatus.INBOUND;   // 신규 계약은 입고 상태로 시작
    }

    // ===== 정보 수정 (보관 시작일까지 편집 허용) =====
    public void updateInfo(LocalDate storageStartDate, LocalDate expectedEndDate, Integer monthlyFee,
                           Double totalVolume, String memo) {
        if (storageStartDate != null) {
            this.storageStartDate = storageStartDate;
        }
        this.expectedEndDate = expectedEndDate;
        this.monthlyFee = monthlyFee;
        this.totalVolume = totalVolume;
        this.memo = memo;
    }

    // ===== [출고 마감] 입고 → 출고: 실제 출고일로 보관 종료일을 마감(override) =====
    /**
     * 실제 출고일을 기록하며 보관 종료일(expectedEndDate)을 그 날짜로 강제 마감한다.
     * → 보관 기간이 실물 출고 시점으로 확정되어 일할 계산·소급 정산이 오차 없이 이어진다.
     */
    public void release(LocalDate actualEndDate) {
        this.status = OrderStatus.OUTBOUND;
        this.actualEndDate = actualEndDate;
        this.expectedEndDate = actualEndDate; // 보관 종료일 자동 마감
    }

    // ===== [출고 취소] 출고 → 입고 =====
    public void unreleased() {
        this.status = OrderStatus.INBOUND;
        this.actualEndDate = null;
    }

    // ===== 편의 판별 =====
    public boolean isInbound() {
        return this.status == OrderStatus.INBOUND;
    }

    public boolean isOutbound() {
        return this.status == OrderStatus.OUTBOUND;
    }
}
