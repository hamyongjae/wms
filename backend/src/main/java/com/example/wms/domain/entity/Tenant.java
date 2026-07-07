package com.example.wms.domain.entity;   // ← 본인 base package에 맞게 수정

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "tenants")
@Getter
@NoArgsConstructor
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;                    // 창고업체명

    @Column(name = "business_number", unique = true, length = 20)
    private String businessNumber;          // 사업자등록번호

    @Column(name = "ceo_name", length = 50)
    private String ceoName;                  // 대표자명

    @Column(name = "phone", length = 20)
    private String phone;                    // 연락처

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "address", length = 255)
    private String address;                  // 주소

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private TenantStatus status = TenantStatus.ACTIVE;   // 운영 상태

    @OneToMany(mappedBy = "tenant")
    private List<Warehouse> warehouses = new ArrayList<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // 값을 받아 객체를 생성하는 생성자
    public Tenant(String name, String businessNumber, String ceoName,
                  String phone, String email, String address) {
        this.name = name;
        this.businessNumber = businessNumber;
        this.ceoName = ceoName;
        this.phone = phone;
        this.email = email;
        this.address = address;
    }
}