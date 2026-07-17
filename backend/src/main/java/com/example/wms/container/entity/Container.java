package com.example.wms.container.entity;

import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 컨테이너 (야적장의 5톤 임대 단위).
 *
 * 한 창고(야적장)에 여러 컨테이너가 있고, 각 컨테이너는 한 번에 하나의 계약에만 배정된다.
 * (한 계약이 여러 컨테이너를 점유하는 1:N은 허용 — currentOrder를 여러 컨테이너가 참조)
 *
 * [동시성] 배정/회수는 "두 관리자가 같은 빈 컨테이너를 동시에 배정" 같은 경합이 생길 수 있어
 *   @Version(낙관적 락) + 서비스의 비관적 락으로 이중 방어한다.
 */
@Entity
@Table(name = "containers",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_container_tenant_no", columnNames = {"tenant_id", "container_no"}),
        indexes = {
                @Index(name = "idx_container_tenant", columnList = "tenant_id"),
                @Index(name = "idx_container_warehouse", columnList = "warehouse_id")
        })
@Getter
@NoArgsConstructor
public class Container {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ===== 테넌트 격리 =====
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    // ===== 소속 창고(야적장) =====
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(name = "container_no", nullable = false, length = 50)
    private String containerNo;        // 컨테이너 번호/식별자 (업체 내 유일)

    @Column(name = "capacity_ton", nullable = false)
    private Integer capacityTon;       // 용량(톤), 기본 5

    // ===== 현재 점유 계약 (없으면 빈 컨테이너) =====
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "current_order_id")
    private StorageOrder currentOrder;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private ContainerStatus status;

    @Column(name = "memo", length = 255)
    private String memo;

    // ===== 보관 일정 =====
    @Column(name = "inbound_date")
    private LocalDate inboundDate;             // 입고일

    @Column(name = "expected_outbound_date")
    private LocalDate expectedOutboundDate;    // 출고 예정일

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

    public Container(Tenant tenant, Warehouse warehouse, String containerNo,
                     Integer capacityTon, String memo) {
        this.tenant = tenant;
        this.warehouse = warehouse;
        this.containerNo = containerNo;
        this.capacityTon = (capacityTon != null) ? capacityTon : 5;
        this.memo = memo;
        this.status = ContainerStatus.AVAILABLE;
    }

    // ===== 기본 정보 수정 =====
    public void updateInfo(String containerNo, Integer capacityTon, String memo) {
        this.containerNo = containerNo;
        if (capacityTon != null) {
            this.capacityTon = capacityTon;
        }
        this.memo = memo;
    }

    // 보관 일정(입고일/출고예정일) 설정·수정
    public void setStorageDates(LocalDate inboundDate, LocalDate expectedOutboundDate) {
        this.inboundDate = inboundDate;
        this.expectedOutboundDate = expectedOutboundDate;
    }

    // ===== 계약 배정 (빈 컨테이너 → 사용중) =====
    public void assignTo(StorageOrder order) {
        if (this.status != ContainerStatus.AVAILABLE) {
            throw new IllegalStateException("배정은 빈(AVAILABLE) 컨테이너만 가능합니다. 현재=" + status);
        }
        this.currentOrder = order;
        this.status = ContainerStatus.OCCUPIED;
    }

    // ===== 계약 회수 (사용중 → 빈) =====
    public void release() {
        if (this.status != ContainerStatus.OCCUPIED) {
            throw new IllegalStateException("회수는 사용 중(OCCUPIED) 컨테이너만 가능합니다. 현재=" + status);
        }
        this.currentOrder = null;
        this.status = ContainerStatus.AVAILABLE;
    }

    // ===== 상태 변경 (점검/폐기/복귀 등, 배정과는 분리) =====
    public void changeStatus(ContainerStatus newStatus) {
        if (newStatus == ContainerStatus.OCCUPIED) {
            throw new IllegalStateException("사용중 상태는 계약 배정으로만 설정됩니다.");
        }
        if (this.status == ContainerStatus.OCCUPIED) {
            throw new IllegalStateException("사용 중인 컨테이너는 먼저 회수해야 상태를 변경할 수 있습니다.");
        }
        this.status = newStatus;
    }
}
