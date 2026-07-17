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
    private UserRole role = UserRole.STAFF;   // 권한 (테�