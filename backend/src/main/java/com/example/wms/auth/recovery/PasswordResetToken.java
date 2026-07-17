package com.example.wms.auth.recovery;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * 비밀번호 재설정 토큰 (일회용·시간제한).
 *
 * 사용자를 userId로만 참조해 토큰 자체에 개인정보를 두지 않는다.
 * 유효시간(만료) 경과 또는 1회 사용 후에는 재사용 불가.
 * (운영에서 Redis로 대체 가능 — 여기서는 별도 인프라 없이 DB에 저장)
 */
@Entity
@Table(name = "password_reset_tokens",
        indexes = @Index(name = "idx_prt_token", columnList = "token"))
@Getter
@NoArgsConstructor
public class PasswordResetToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "token", nullable = false, unique = true, length = 64)
    private String token;               // UUID 문자열

    @Column(name = "user_id", nullable = false)
    private Long userId;                // 대상 사용자

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;    // 만료 시각

    @Column(name = "used", nullable = false)
    private boolean used = false;       // 1회 사용 후 true

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public PasswordResetToken(String token, Long userId, LocalDateTime expiresAt) {
        this.token = token;
        this.userId = userId;
        this.expiresAt = expiresAt;
        this.used = false;
    }

    /** 사용 가능한 토큰인가 (미사용 & 미만료). */
    public boolean isUsable() {
        return !used && expiresAt.isAfter(LocalDateTime.now());
    }

    public void markUsed() {
        this.used = true;
    }
}
