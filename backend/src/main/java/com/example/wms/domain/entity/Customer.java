package com.example.wms.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "customers")
@Getter
@NoArgsConstructor
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;                    // 고객명

    @Column(name = "phone", length = 20)
    private String phone;                   // 연락처

    @Column(name = "email", length = 100)
    private String email;

    @Column(name = "address", length = 255)
    private String address;                 // 고객 주소 (이사 출발지 등)

    // 어느 업체의 고객인지
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // 생성자
    public Customer(String name, String phone, String email, String address, Tenant tenant) {
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.address = address;
        this.tenant = tenant;
    }

    // 수정 메서드 (소속 업체는 변경 불가)
    public void updateInfo(String name, String phone, String email, String address) {
        this.name = name;
        this.phone = phone;
        this.email = email;
        this.address = address;
    }
}