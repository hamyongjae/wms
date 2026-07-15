package com.example.wms.customer.entity;
import com.example.wms.tenant.entity.Tenant;

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

    // ===== 1. 기본 인적 사항 및 식별 정보 =====
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;                       // 소속 창고업체

    @Column(name = "name", nullable = false, length = 100)
    private String name;                         // 고객명 / 법인명

    @Enumerated(EnumType.STRING)
    @Column(name = "customer_type", nullable = false, length = 20)
    private CustomerType customerType = CustomerType.INDIVIDUAL;   // 개인/기업

    @Column(name = "business_number", length = 20)
    private String businessNumber;               // 기업일 경우 사업자번호 (nullable)

    // ===== 2. 연락처 및 비상 대책 정보 =====
    @Column(name = "phone_number", length = 20)
    private String phoneNumber;                  // 주 연락처

    @Column(name = "email", length = 100)
    private String email;                        // 청구서/계약서 발송용

    @Column(name = "emergency_contact_name", length = 50)
    private String emergencyContactName;         // 비상 연락처 이름

    @Column(name = "emergency_contact_phone", length = 20)
    private String emergencyContactPhone;        // 비상 연락처 번호

    // ===== 3. 물류 및 주소 정보 =====
    @Column(name = "origin_address", length = 255)
    private String originAddress;                // 출발지 (짐을 실어온 곳)

    @Column(name = "destination_address", length = 255)
    private String destinationAddress;           // 도착지 (미정 가능)

    @Column(name = "postal_code", length = 10)
    private String postalCode;                   // 우편번호

    // ===== 4. 계약 및 법적 안전장치 =====
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CustomerStatus status = CustomerStatus.ACTIVE;   // 이용중/휴면/블랙리스트

    @Column(name = "contract_agreed", nullable = false)
    private boolean contractAgreed = false;      // 약관/개인정보 동의

    @Column(name = "disposal_consent", nullable = false)
    private boolean disposalConsent = false;     // 장기 연체 시 처분 동의

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;                         // 현장 작업자용 특이사항

    // ===== 5. 시스템 공통 컬럼 =====
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ===== 생성자 =====
    public Customer(Tenant tenant, String name, CustomerType customerType, String businessNumber,
                    String phoneNumber, String email,
                    String emergencyContactName, String emergencyContactPhone,
                    String originAddress, String destinationAddress, String postalCode,
                    boolean contractAgreed, boolean disposalConsent, String memo) {
        this.tenant = tenant;
        this.name = name;
        this.customerType = customerType;
        this.businessNumber = businessNumber;
        this.phoneNumber = phoneNumber;
        this.email = email;
        this.emergencyContactName = emergencyContactName;
        this.emergencyContactPhone = emergencyContactPhone;
        this.originAddress = originAddress;
        this.destinationAddress = destinationAddress;
        this.postalCode = postalCode;
        this.contractAgreed = contractAgreed;
        this.disposalConsent = disposalConsent;
        this.memo = memo;
    }

    // ===== 수정 메서드 (소속 업체는 변경 불가) =====
    public void updateInfo(String name, CustomerType customerType, String businessNumber,
                           String phoneNumber, String email,
                           String emergencyContactName, String emergencyContactPhone,
                           String originAddress, String destinationAddress, String postalCode,
                           String memo) {
        this.name = name;
        this.customerType = customerType;
        this.businessNumber = businessNumber;
        this.phoneNumber = phoneNumber;
        this.email = email;
        this.emergencyContactName = emergencyContactName;
        this.emergencyContactPhone = emergencyContactPhone;
        this.originAddress = originAddress;
        this.destinationAddress = destinationAddress;
        this.postalCode = postalCode;
        this.memo = memo;
    }

    // ===== 상태 변경 (별도 메서드로 분리) =====
    public void changeStatus(CustomerStatus status) {
        this.status = status;
    }
}