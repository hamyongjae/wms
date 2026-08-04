package com.example.wms.push.entity;

import com.example.wms.user.entity.User;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * [웹 푸시 구독] 사용자 1명이 여러 기기/브라우저에서 구독할 수 있으므로 User와 N:1.
 * User와 마찬가지로 @TenantId 대상이 아니다 — 항상 "현재 로그인한 사용자 본인 것만" 또는
 * "user.tenant.id로 조회" 형태로만 다루므로 별도 테넌트 컬럼이 필요 없다.
 */
@Entity
@Table(name = "push_subscriptions",
        uniqueConstraints = @UniqueConstraint(name = "uk_push_subscription_endpoint", columnNames = "endpoint"))
@Getter
@NoArgsConstructor
public class PushSubscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // 브라우저 푸시 서비스 엔드포인트 URL — FCM/Mozilla 등 서비스별로 길 수 있어 넉넉히 잡는다.
    @Column(name = "endpoint", nullable = false, length = 1000)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = 255)
    private String p256dh;   // 구독 공개키

    @Column(name = "auth", nullable = false, length = 255)
    private String auth;     // 구독 인증 시크릿

    // 설정 화면에 "이 기기"를 구분해 보여주기 위한 표시용 정보(선택)
    @Column(name = "user_agent", length = 255)
    private String userAgent;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public PushSubscription(User user, String endpoint, String p256dh, String auth, String userAgent) {
        this.user = user;
        this.endpoint = endpoint;
        this.p256dh = p256dh;
        this.auth = auth;
        this.userAgent = userAgent;
    }

    /** 브라우저가 같은 구독을 다시 보냈을 때(키 갱신 등) 최신 값으로 덮어쓴다. */
    public void refresh(String p256dh, String auth, String userAgent) {
        this.p256dh = p256dh;
        this.auth = auth;
        this.userAgent = userAgent;
    }
}
