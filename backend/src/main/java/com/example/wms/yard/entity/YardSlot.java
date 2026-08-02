package com.example.wms.yard.entity;

import com.example.wms.container.entity.Container;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.yard.exception.LocationFullException;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 보관창고 로케이션 슬롯 (Block-Row-Column-Tier 격자의 한 칸).
 *
 * 물리적 위치 하나 = 한 슬롯이며 최대 한 대의 컨테이너를 담는다.
 * 좌표는 (창고, 블록, 열, 연, 단)으로 유일하다.
 *
 * [동시성] 적재/이동 시 이 슬롯을 비관적 락으로 잠가 "동시 적재로 인한 데이터 뒤틀림"을 막는다.
 */
@Entity
@Table(name = "yard_slots",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_slot_coords",
                columnNames = {"tenant_id", "warehouse_id", "block", "row_no", "column_no", "tier"}),
        indexes = {
                @Index(name = "idx_slot_tenant", columnList = "tenant_id"),
                @Index(name = "idx_slot_warehouse", columnList = "warehouse_id"),
                @Index(name = "idx_slot_container", columnList = "container_id")
        })
@Getter
@NoArgsConstructor
public class YardSlot {

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
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    // ===== 격자 좌표 =====
    @Column(name = "block", nullable = false, length = 20)
    private String block;          // 구역 (예: A)

    @Column(name = "row_no", nullable = false)
    private Integer rowNo;         // 열 (가로)

    @Column(name = "column_no", nullable = false)
    private Integer columnNo;      // 연 (세로)

    @Column(name = "tier", nullable = false)
    private Integer tier;          // 단 (높이, 1=바닥)

    // ===== 점유 상태 =====
    @Column(name = "occupied", nullable = false)
    private boolean occupied;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "container_id")
    private Container container;    // 이 슬롯에 놓인 컨테이너 (없으면 빈 슬롯)

    // ===== 운영 상태 =====
    // active=false → '미사용(운영 중지)'. 장기 공실·시설 고장 등으로 입고 대상에서 제외한다.
    @Column(name = "active", nullable = false)
    @org.hibernate.annotations.ColumnDefault("true")
    private boolean active = true;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public YardSlot(Tenant tenant, Warehouse warehouse,
                    String block, Integer rowNo, Integer columnNo, Integer tier) {
        this.tenant = tenant;
        this.warehouse = warehouse;
        this.block = block;
        this.rowNo = rowNo;
        this.columnNo = columnNo;
        this.tier = tier;
        this.occupied = false;
    }

    /**
     * 사람이 읽는 위치 라벨.
     * [층별 번호 체계] tier=층, columnNo=자리 번호 → "1층-15" 형태로 표기.
     */
    public String getLocationLabel() {
        return tier + "층-" + columnNo;
    }

    /** 컨테이너 적재 (이미 차 있으면 예외) */
    public void place(Container c) {
        if (this.occupied) {
            throw new LocationFullException("이미 컨테이너가 있는 위치입니다: " + getLocationLabel());
        }
        this.container = c;
        this.occupied = true;
    }

    /** 슬롯 비우기 */
    public void vacate() {
        this.container = null;
        this.occupied = false;
    }

    /** 운영 상태 전환 (true=사용, false=미사용/운영 중지) */
    public void changeActive(boolean active) {
        this.active = active;
    }
}
