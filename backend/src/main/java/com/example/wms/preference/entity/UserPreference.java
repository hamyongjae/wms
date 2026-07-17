package com.example.wms.preference.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * 사용자별 UI 개인화 설정.
 *
 * 지금은 사이드바 메뉴 순서만 담는다(CSV로 저장 — 라우트 키를 콤마로 연결).
 * 사용자당 1행(userId 유니크). 향후 테마/기본 화면 등 개인화가 늘면 컬럼을 추가한다.
 */
@Entity
@Table(name = "user_preferences",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_pref_user", columnNames = {"user_id"}))
@Getter
@NoArgsConstructor
public class UserPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    // 메뉴 순서 (라우트 키 CSV) 예: "/dashboard,/calendar,/orders,..."
    @Column(name = "menu_order", columnDefinition = "TEXT")
    private String menuOrder;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    public UserPreference(Long userId, String menuOrder) {
        this.userId = userId;
        this.menuOrder = menuOrder;
    }

    public void updateMenuOrder(String menuOrder) {
        this.menuOrder = menuOrder;
    }
}
