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

    // ===== [출고 처리] 입고 → 출고 =====
    public void release(LocalDate actualEndDate) {
        this.status = OrderStatus.OUTBOUND;
        this.actualEndDate = actualEndDate;
    }

    // ===== [출고 취소] 출고 → 입고 =====
    public void unreleased() {
        this.status = OrderStatus.INBOUND;
        this.actualEndDate = null;
    }

    // ===== [상태 토글] 현재 상태의 반대로 전환 =====
    /**
     * 입고 ↔ 출고 단일 토글.
     * @param actualEndDate 출고로 전환 시 기록할 실제 출고일 (입고로 전환 시 무시)
     */
    public void toggleStatus(LocalDate actualEndDate) {
        if (this.status == OrderStatus.INBOUND) {
            release(actualEndDate != null ? actualEndDate : LocalDate.now());
        } else {
            unreleased();
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
