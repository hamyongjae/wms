package com.example.wms.yard.entity;

import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.TenantId;

import java.time.LocalDateTime;

/**
 * [위치 이력] 계약이 물리적으로 거쳐간 자리를 시간순으로 남긴다 — 입고·이동·출고 때마다 한 줄씩.
 *
 * YardSlot은 "지금 어디 있나"만 담고 있어(적재/공실 이진 상태), 지나간 자리는 그대로 사라진다.
 * 일정관리 화면에서 계약 하나의 입고→이동→출고 전체 동선을 보여주려면 별도로 남겨야 해서 만든
 * 순수 이력 테이블 — 슬롯·창고를 참조가 아니라 이름 스냅샷(warehouseName·locationLabel)으로
 * 저장한다. 나중에 자리 좌표가 재구성되거나 창고명이 바뀌어도 "그때 그 이름"이 그대로 남는다.
 */
@Entity
@Table(name = "container_location_histories",
        indexes = {
                @Index(name = "idx_loc_hist_tenant", columnList = "tenant_id"),
                @Index(name = "idx_loc_hist_order", columnList = "order_id")
        })
@Getter
@NoArgsConstructor
public class ContainerLocationHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @TenantId
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", insertable = false, updatable = false)
    private Tenant tenant;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id", nullable = false)
    private StorageOrder order;

    @Column(name = "warehouse_name", nullable = false, length = 100)
    private String warehouseName;

    @Column(name = "location_label", nullable = false, length = 50)
    private String locationLabel;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 20)
    private LocationEventType eventType;

    @Column(name = "occurred_at", nullable = false)
    private LocalDateTime occurredAt;

    public ContainerLocationHistory(Tenant tenant, StorageOrder order, String warehouseName,
                                    String locationLabel, LocationEventType eventType, LocalDateTime occurredAt) {
        this.tenant = tenant;
        this.order = order;
        this.warehouseName = warehouseName;
        this.locationLabel = locationLabel;
        this.eventType = eventType;
        this.occurredAt = occurredAt;
    }
}
