package com.example.wms.warehouse.entity;
import com.example.wms.tenant.entity.Tenant;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "warehouses")
@Getter
@NoArgsConstructor
public class Warehouse {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 100)
    private String name; // 창고명 (예: 일산 창고)

    @Column(name = "address", length = 255)
    private String address; // 창고 주소

    @Column(name = "phone", length = 20)
    private String phone; // 창고 연락처

    // --- 여기가 핵심: Tenant와의 관계 ---
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
    private Tenant tenant; // 이 창고가 소속된 업체

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public Warehouse(String name, String address, String phone, Tenant tenant) {
        this.name = name;
        this.address = address;
        this.phone = phone;
        this.tenant = tenant;
    }

    public void updateInfo(String name, String address, String phone) {
        this.name = name;
        this.address = address;
        this.phone = phone;
    }
}