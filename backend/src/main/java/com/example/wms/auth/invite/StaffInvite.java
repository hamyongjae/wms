package com.example.wms.auth.invite;

import com.example.wms.tenant.entity.Tenant;
import com.example.wms.user.entity.UserRole;
import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * [케이스 B] 직원 초대장.
 *
 * 사장(ADMIN)이 직원의 이메일을 미리 등록해 두면(PENDING),
 * 그 이메일의 소셜 계정으로 로그인한 사용자가 해당 tenant에 STAFF로 자동 매핑된다.
 * 이메일이 곧 초대-계정 매칭의 키다.
 */
@Entity
@Table(name = "staff_invites",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_staff_invite_email",
                columnNames = {"email"}))
@Getter
@NoArgsConstructor
public class StaffInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // 초대한 회사
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
    private Tenant tenant;

    @Column(name = "email", nullable = false, length = 150)
    private String email;

    @Column(name = "name", length = 50)
    private String name;                // 표시용(선택)

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false, length = 20)
    private UserRole role = UserRole.STAFF;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private InviteStatus status = InviteStatus.PENDING;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public StaffInvite(Tenant tenant, String email, String name, UserRole role) {
        this.tenant = tenant;
        this.email = email;
        this.name = name;
        this.role = (role != null) ? role : UserRole.STAFF;
        this.status = InviteStatus.PENDING;
    }

    /** 초대 수락 처리(소셜 로그인으로 매핑 완료). */
    public void accept() {
        if (this.status != InviteStatus.PENDING) {
            throw new IllegalStateException("이미 처리된 초대입니다.");
        }
        this.status = InviteStatus.ACCEPTED;
    }
}
