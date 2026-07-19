package com.example.wms.user.entity;
import com.example.wms.tenant.entity.Tenant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
/*
 * [소셜 확장 스키마] 자체 가입(LOCAL)과 소셜 가입(GOOGLE/KAKAO/NAVER)을 하나의 테이블로 통합 관리한다.
 *
 * 유니크 제약 3종:
 *  - uk_users_username         : 아이디 전역 유일(방식1 자동 테넌트 해석의 전제)
 *  - uk_users_email            : 이메일 전역 유일(소셜 매칭·직원 초대의 키). NULL 다중 허용(Postgres).
 *  - uk_users_provider_pid     : (provider, providerId) 조합 유일. 같은 소셜 계정 중복 가입 차단.
 */
@Table(name = "users",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_users_username", columnNames = {"username"}),
                @UniqueConstraint(name = "uk_users_email", columnNames = {"email"}),
                @UniqueConstraint(name = "uk_users_provider_pid", columnNames = {"provider", "provider_id"})
        })
@Getter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 소속 창고업체 — 소셜 최초 진입 시엔 아직 미지정(NULL)일 수 있다(가입 미완성 상태).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id")   // nullable: 소셜 인증만 된 PENDING 유저는 tenant가 없다
    private Tenant tenant;

    @Column(name = "username", nullable = false, length = 100)
    private String username;                 // 로그인 아이디(LOCAL) 또는 소셜 합성 아이디

    // 소셜 가입자는 비밀번호가 없다 → nullable. 대신 로컬 로그인 시 방어 로직으로 우회를 막는다.
    @Column(name = "password", length = 100)
    private String password;                 // BCrypt 해시 (평문 저장 금지)

    @Column(name = "email", length = 150)
    private String email;                    // 소셜 매칭·직원 초대 매핑의 키

    @Column(name = "name", nullable = false, length = 50)
    private String name;                     // 사용자 이름

    // 가입 경로(LOCAL/GOOGLE/KAKAO/NAVER)
    @Enumerated(EnumType.STRING)
    @Column(name = "provider", nullable = false, length = 20)
    private LoginProvider provider = LoginProvider.LOCAL;

    // 소셜 플랫폼 고유 식별자 (LOCAL이면 null)
    @Column(name = "provider_id", length = 100)
    private String providerId;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private UserRole role = UserRole.STAFF;   // 권한 (테넌트 바인딩 시 확정)

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status = UserStatus.ACTIVE;

    // ===== 주거래 계좌 (수납 계좌 연동용) =====
    @Column(name = "bank_name", length = 50)
    private String bankName;             // 은행명

    @Column(name = "account_number", length = 50)
    private String accountNumber;        // 계좌번호

    @Column(name = "account_holder", length = 50)
    private String accountHolder;        // 예금주

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // ===================== 생성 팩토리 =====================

    /** [LOCAL] 자체 가입 사용자 — password는 반드시 해시된 값을 넘길 것(서비스 계층에서 인코딩). */
    public User(Tenant tenant, String username, String encodedPassword,
                String name, UserRole role) {
        this.tenant = tenant;
        this.username = username;
        this.password = encodedPassword;
        this.name = name;
        this.role = role;
        this.provider = LoginProvider.LOCAL;
        this.providerId = null;
        this.status = UserStatus.ACTIVE;
    }

    /** [LOCAL] 이메일까지 받는 자체 가입 (이메일 중복검사 대상). */
    public static User localUser(Tenant tenant, String username, String encodedPassword,
                                 String name, String email, UserRole role) {
        User u = new User(tenant, username, encodedPassword, name, role);
        u.email = email;
        return u;
    }

    /**
     * [SOCIAL] 소셜 인증만 된 '가입 미완성' 사용자.
     * tenant/role은 아직 확정 전이며 status=PENDING. password는 없다.
     * username은 스키마의 NOT NULL/UNIQUE를 만족시키기 위해 provider+providerId로 합성한다.
     */
    public static User pendingSocialUser(LoginProvider provider, String providerId,
                                         String email, String name) {
        User u = new User();
        u.provider = provider;
        u.providerId = providerId;
        u.email = email;
        u.name = name;
        u.username = provider.name().toLowerCase() + "_" + providerId;  // 합성 아이디(로그인엔 미사용)
        u.password = null;
        u.tenant = null;
        u.role = UserRole.STAFF;
        u.status = UserStatus.PENDING;
        return u;
    }

    // ===================== 도메인 행위 =====================

    /** [케이스 A] 신규 사장: 새 회사(tenant)에 ADMIN으로 바인딩하며 가입 완료. */
    public void bindTenantAsAdmin(Tenant tenant) {
        assertNotYetBound();
        this.tenant = tenant;
        this.role = UserRole.ADMIN;
        this.status = UserStatus.ACTIVE;
    }

    /** [케이스 B] 직원 초대 수락: 기존 회사(tenant)에 STAFF로 바인딩하며 가입 완료. */
    public void bindTenantAsStaff(Tenant tenant) {
        assertNotYetBound();
        this.tenant = tenant;
        this.role = UserRole.STAFF;
        this.status = UserStatus.ACTIVE;
    }

    private void assertNotYetBound() {
        if (this.tenant != null) {
            throw new IllegalStateException("이미 소속 업체가 지정된 계정입니다.");
        }
    }

    /** 가입 완료 여부 = 소속 업체가 지정되었는가. */
    public boolean isRegistrationComplete() {
        return this.tenant != null;
    }

    /**
     * [보안] 로컬(ID/PW) 로그인 가능 여부 검증.
     * 소셜 가입자는 password가 null이라, 이 가드가 없으면
     * "빈 비밀번호 우회 로그인" 같은 구멍이 생긴다. → 소셜 계정의 로컬 로그인 자체를 차단.
     */
    public boolean canLoginWithPassword() {
        // 스키마 확장 이전에 만들어진 기존 행은 provider가 NULL일 수 있다(마이그레이션 미backfill).
        // 이런 레거시 계정이 로그인에서 잠기지 않도록 NULL은 LOCAL로 간주한다.
        boolean local = (this.provider == null) || (this.provider == LoginProvider.LOCAL);
        return local && this.password != null;
    }

    public void changePassword(String encodedPassword) {
        this.password = encodedPassword;
    }

    public void changeRole(UserRole role) {
        this.role = role;
    }

    public void changeStatus(UserStatus status) {
        this.status = status;
    }

    /** 주거래 계좌 정보 갱신 (관리자가 직원 계좌 등록·수정) */
    public void updateAccount(String bankName, String accountNumber, String accountHolder) {
        this.bankName = bankName;
        this.accountNumber = accountNumber;
        this.accountHolder = accountHolder;
    }

    public boolean hasAccount() {
        return this.accountNumber != null && !this.accountNumber.isBlank();
    }
}
