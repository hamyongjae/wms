package com.example.wms.customer.entity;
import com.example.wms.tenant.entity.Tenant;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
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
    private Tenant tenant;                       // 소속 창고업체

    @Column(name = "name", nullable = false, length = 100)
    private String name;                         // 고객명 / 법인명

    @Enumerated(EnumType.STRING)
    @Column(name = "customer_type", nullable = false, length = 20)
    private CustomerType customerType = CustomerType.INDIVIDUAL;   // 개인/기업

    @Column(name = "business_number", length = 20)
    private String businessNumber;               // 기업일 경우 사업자번호 (nullable)

    // ===== 2. 연락처 =====
    @Column(name = "phone_number", length = 20)
    private String phoneNumber;                  // 주 연락처

    @Column(name = "email", length = 100)
    private String email;                        // 청구서·알림 발송용

    // ===== 3. 상태 및 메모 =====
    // [슬림화] YMS에서 의미 없는 출발/도착 주소·우편번호·비상연락·동의 필드 제거.
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CustomerStatus status = CustomerStatus.ACTIVE;   // 이용중/휴면/블랙리스트

    // 블랙리스트 메타데이터 — BLACKLISTED일 때만 채워지고, 해제 시 비워진다.
    @Column(name = "blacklist_reason", length = 255)
    private String blacklistReason;              // 지정 사유(필수)

    @Column(name = "blacklisted_at")
    private LocalDateTime blacklistedAt;         // 지정 일자

    @Column(name = "memo", columnDefinition = "TEXT")
    private String memo;                         // 현장 작업자용 특이사항

    // ===== 5. 시스템 공통 컬럼 =====
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ===== 생성자 (슬림) =====
    public Customer(Tenant tenant, String name, CustomerType customerType, String businessNumber,
                    String phoneNumber, String email, String memo) {
        this.tenant = tenant;
        this.name = name;
        this.customerType = customerType;
        this.businessNumber = businessNumber;
        this.phoneNumber = phoneNumber;
        this.email = email;
        this.memo = memo;
    }

    // ===== 수정 메서드 (소속 업체는 변경 불가) =====
    public void updateInfo(String name, CustomerType customerType, String businessNumber,
                           String phoneNumber, String email, String memo) {
        this.name = name;
        this.customerType = customerType;
        this.businessNumber = businessNumber;
        this.phoneNumber = phoneNumber;
        this.email = email;
        this.memo = memo;
    }

    // ===== 상태 변경 =====
    // BLACKLISTED로 바꿀 땐 사유가 필수이며 지정 일자를 기록한다.
    // 그 외 상태로 바꾸면(정상/휴면 복구) 블랙리스트 메타는 초기화한다.
    public void applyStatus(CustomerStatus status, String reason) {
        if (status == CustomerStatus.BLACKLISTED) {
            if (reason == null || reason.isBlank()) {
                throw new IllegalArgumentException("블랙리스트 지정 사유는 필수입니다.");
            }
            this.blacklistReason = reason;
            this.blacklistedAt = LocalDateTime.now();
        } else {
            this.blacklistReason = null;
            this.blacklistedAt = null;
        }
        this.status = status;
    }

    public boolean isBlacklisted() {
        return this.status == CustomerStatus.BLACKLISTED;
    }
}