package com.example.wms.domain.entity;

import jakarta.persistence.*;
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
    private String name;                    // 창고명 (예: 일산 창고)

    @Column(name = "address", length = 255)
    private String address;                 // 창고 주소

    @Column(name = "phone", length = 20)
    private String phone;                   // 창고 연락처

    // --- 여기가 핵심: Tenant와의 관계 ---
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;                   // 이 창고가 소속된 업체

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
}