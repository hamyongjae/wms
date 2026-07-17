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
    private OrderStatus status = OrderStatus.RECEIVED;

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

    // ===== 출고 처리 =====
    public void release(LocalDate actualEndDate) {
        this.status = OrderStatus.RELEASED;
        this.actualEndDate = actualEndDate;
    }
}