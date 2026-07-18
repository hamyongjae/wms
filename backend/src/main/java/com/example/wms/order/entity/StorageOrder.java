package com.example.wms.order.entity;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.customer.entity.Customer;
import com.example.wms.warehouse.entity.Warehouse;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "storage_orders")
@Getter
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

    // ===== 상태 =====
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrderStatus status = OrderStatus.PENDING;

    @Column(name = "slot_assigned", nullable = false)
    private boolean slotAssigned = false;  // 슬롯 위치 지정 여부

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
        this.status = OrderStatus.RECEIVED;
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

    // ===== 상태 변경 =====
    public void changeStatus(OrderStatus status) {
        this.status = status;
    }

    // ===== 슬롯 지정/해제 =====
    public void assignSlot() {
        this.slotAssigned = true;
        // 슬롯 지정 시 상태 자동 전이: PENDING -> IN_STORAGE (기간 내) 또는 PENDING_RELEASE (기간 외)
        evaluateStatus();
    }

    public void unassignSlot() {
        this.slotAssigned = false;
        // 슬롯 해제 시 상태를 PENDING으로 복원
        this.status = OrderStatus.PENDING;
    }

    // ===== 출고 처리 =====
    public void release(LocalDate actualEndDate) {
        this.status = OrderStatus.RELEASED;
        this.actualEndDate = actualEndDate;
        // 출고 완료 시 슬롯 정보 해제
        this.slotAssigned = false;
    }

    // ===== 출고 취소 =====
    public void unreleased() {
        this.actualEndDate = null;
        this.slotAssigned = true;  // 다시 슬롯 할당됨 상태로 복구
        evaluateStatus();           // 현재 날짜 기준으로 상태 재평가
    }

    // ===== 자동 상태 평가 (시간 기반) =====
    /**
     * 현재 날짜를 기준으로 상태를 자동 평가하고 갱신.
     * 배치 작업이나 슬롯 지정/해제 후 호출되어야 함.
     */
    public void evaluateStatus() {
        LocalDate today = LocalDate.now();

        // 출고완료 상태는 변경하지 않음
        if (this.status == OrderStatus.RELEASED) {
            return;
        }

        // 취소 상태는 변경하지 않음
        if (this.status == OrderStatus.CANCELLED) {
            return;
        }

        // 슬롯이 지정되지 않았다면 입고예정 상태 유지
        if (!this.slotAssigned) {
            this.status = OrderStatus.PENDING;
            return;
        }

        // 슬롯 지정됨 + 기간 내 -> 보관중
        if (today.isAfter(this.storageStartDate) || today.isEqual(this.storageStartDate)) {
            if (this.expectedEndDate == null || today.isBefore(this.expectedEndDate) || today.isEqual(this.expectedEndDate)) {
                this.status = OrderStatus.IN_STORAGE;
                return;
            }
        }

        // 슬롯 지정됨 + 기간 외 -> 출고예정
        if (this.expectedEndDate != null && today.isAfter(this.expectedEndDate)) {
            this.status = OrderStatus.PENDING_RELEASE;
            return;
        }

        // 기간 미도래 + 슬롯 지정됨 -> 입고예정
        this.status = OrderStatus.PENDING;
    }

    // ===== 미납/연체 판별 =====
    public boolean isOverdue() {
        return this.status == OrderStatus.PENDING_RELEASE;
    }
}