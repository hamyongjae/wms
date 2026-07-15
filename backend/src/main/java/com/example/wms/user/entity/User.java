package com.example.wms.user.entity;
import com.example.wms.tenant.entity.Tenant;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
// username은 tenant 안에서만 유일 (다른 업체끼리는 같은 아이디 허용)
@Table(name = "users",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_users_tenant_username",
                columnNames = {"tenant_id", "username"}))
@Getter
@NoArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 소속 창고업체 — 이 계정이 접근할 수 있는 데이터 범위를 결정
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Tenant tenant;

    @Column(name = "username", nullable = false, length = 50)
    private String username;                 // 로그인 아이디

    @Column(name = "password", nullable = false, length = 100)
    private String password;                 // BCrypt 해시 (평문 저장 금지)

    @Column(name = "name", nullable = false, length = 50)
    private String name;                     // 직원 이름

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private UserRole role = UserRole.STAFF;   // 권한

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UserStatus status = UserStatus.ACTIVE;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // password는 반드시 해시된 값을 넘길 것 (서비스 계층에서 인코딩)
    public User(Tenant tenant, String username, String encodedPassword,
                String name, UserRole role) {
        this.tenant = tenant;
        this.username = username;
        this.password = encodedPassword;
        this.name = name;
        this.role = role;
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
}
