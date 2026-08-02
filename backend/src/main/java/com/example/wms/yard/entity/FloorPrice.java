package com.example.wms.yard.entity;

import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * [층별 보관 단가] (창고, 층) 단위의 기본 보관 단가 메타.
 *
 * 슬롯 144개마다 단가를 저장하지 않고 층(tier) 단위로 한 행만 관리한다.
 *  → 층 전체 단가 변경이 UPDATE/INSERT 1건으로 끝나고,
 *    계약 등록 시 슬롯의 층(tier)만 알면 단가를 O(1)로 조회할 수 있다.
 */
@Entity
@Table(name = "floor_prices",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_floor_price", columnNames = {"tenant_id", "warehouse_id", "tier"}),
        indexes = @Index(name = "idx_floor_price_wh", columnList = "tenant_id, warehouse_id"))
@Getter
@NoArgsConstructor
public class FloorPrice {

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

    @Column(name = "tier", nullable = false)
    private Integer tier;             // 층 (1=바닥)

    @Column(name = "unit_price", nullable = false)
    private Integer unitPrice;        // 층 기본 보관 단가(원/일)

    @Column(name = "min_fee")
    private Integer minFee;           // 최소 보관료(원) — 실제 보관료가 미달 시 이 금액으로 상향

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public FloorPrice(Tenant tenant, Warehouse warehouse, Integer tier, Integer unitPrice, Integer minFee) {
        this.tenant = tenant;
        this.warehouse = warehouse;
        this.tier = tier;
        this.unitPrice = unitPrice;
        this.minFee = minFee;
    }

    public void changePrice(Integer unitPrice, Integer minFee) {
        this.unitPrice = unitPrice;
        this.minFee = minFee;
    }
}
