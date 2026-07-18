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

    // ===== 상태 =====
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrderStatus status = OrderStatus.PENDING;

    @Column(name = "slot_assigned")
    private Boolean slotAssigned = false;  // 슬롯 위치 지정 여부

    @Transient
    private OrderStatus computedStatus;  // 계산된 상태 (DB 미저장)

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
        this.status = OrderStatus.PENDING;
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

    // ===== [JPA 라이프사이클] 조회 후 실시간 상태 계산 =====
    /**
     * 데이터베이스에서 로드된 직후 호출.
     * 항상 현재 날짜 기준으로 상태를 재평가하고, 변경되면 즉시 DB에 반영.
     * → 배치 없이도 조회 시점에 항상 최신 상태 유지
     */
    @PostLoad
    private void onPostLoad() {
        OrderStatus oldStatus = this.status;
        evaluateStatus();  // 현재 날짜 기준으로 상태 재계산

        // 상태가 변경되었으면 computedStatus에 표시 (UI에서 강조용)
        if (this.status != oldStatus) {
            this.computedStatus = this.status;
        }
    }

    // ===== [실시간 상태 평가] 조회 시마다 호출 =====
    /**
     * 현재 날짜를 기준으로 상태를 실시간 평가.
     * - 이벤트 기반 (슬롯 지정/출고 처리) → 즉시 DB 저장
     * - 시간 기반 (기간 만료) → 조회 시에만 계산
     *
     * 최적화: CPU 비용이 매우 낮음 (단순 날짜 비교만 수행)
     */
    public void evaluateStatus() {
        LocalDate today = LocalDate.now();

        // [출고완료, 취소] 상태는 변경 불가 (최종 상태)
        if (this.status == OrderStatus.RELEASED || this.status == OrderStatus.CANCELLED) {
            return;
        }

        // [조건 1] 슬롯이 지정되지 않았으면 → 입고예정
        if (this.slotAssigned == null || !this.slotAssigned) {
            this.status = OrderStatus.PENDING;
            return;
        }

        // [조건 2] 슬롯 지정 + 기간 내 → 보관중
        // 시작일 ≤ 현재일 ≤ 종료일
        boolean isWithinPeriod =
            (today.isAfter(this.storageStartDate) || today.isEqual(this.storageStartDate)) &&
            (this.expectedEndDate == null ||
             today.isBefore(this.expectedEndDate) ||
             today.isEqual(this.expectedEndDate));

        if (isWithinPeriod) {
            this.status = OrderStatus.IN_STORAGE;
            return;
        }

        // [조건 3] 슬롯 지정 + 기간 만료 → 출고예정 (미납/연체 대상)
        // 현재일 > 종료일
        if (this.expectedEndDate != null && today.isAfter(this.expectedEndDate)) {
            this.status = OrderStatus.PENDING_RELEASE;
            return;
        }

        // [조건 4] 슬롯 지정 + 기간 미도래 → 입고예정
        if (this.storageStartDate != null && today.isBefore(this.storageStartDate)) {
            this.status = OrderStatus.PENDING;
            return;
        }

        // 기본값
        this.status = OrderStatus.PENDING;
    }

    // ===== [미납/연체 판별] 출고예정 상태만 대상 =====
    /**
     * 보관 기간이 지났는데도 아직 출고되지 않은 상태.
     * → 청구/정산 화면에서 강조 표시
     */
    public boolean isOverdue() {
        return this.status == OrderStatus.PENDING_RELEASE;
    }

    // ===== [상태 변경 이벤트 - 즉시 반영] =====
    /**
     * 슬롯 지정 시: 상태 즉시 변경 + DB 저장
     * (시간 기반 상태는 조회 시에만 계산)
     */
    public void assignSlot() {
        this.slotAssigned = true;
        evaluateStatus();
    }

    /**
     * 슬롯 해제 시: 상태를 입고예정으로 복원 + DB 저장
     */
    public void unassignSlot() {
        this.slotAssigned = false;
        this.status = OrderStatus.PENDING;
    }

    /**
     * 출고 처리 시: 상태 고정 + 슬롯 해제 + DB 저장
     */
    public void release(LocalDate actualEndDate) {
        this.status = OrderStatus.RELEASED;
        this.actualEndDate = actualEndDate;
        this.slotAssigned = false;  // 슬롯 자동 해제
    }

    /**
     * 출고 취소 시: 상태 복구 + 슬롯 재할당 + DB 저장
     */
    public void unreleased() {
        this.actualEndDate = null;
        this.slotAssigned = true;
        evaluateStatus();  // 현재 날짜 기준으로 상태 재평가
    }
}