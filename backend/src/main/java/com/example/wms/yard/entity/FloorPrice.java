package com.example.wms.yard.entity;

import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import jakarta.persistence.*;
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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(name = "tier", nullable = false)
    private Integer tier;             // 층 (1=바닥)

    @Column(name = "unit_price", nullable = false)
    private Integer unitPrice;        // 층 기본 보관 단가(원)

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public FloorPrice(Tenant tenant, Warehouse warehouse, Integer tier, Integer unitPrice) {
        this.tenant = tenant;
        this.warehouse = warehouse;
        this.tier = tier;
        this.unitPrice = unitPrice;
    }

    public void changePrice(Integer unitPrice) {
        this.unitPrice = unitPrice;
    }
}
