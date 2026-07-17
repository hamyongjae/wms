package com.example.wms.auth.dto;

import com.example.wms.user.entity.User;
import com.example.wms.user.entity.UserRole;
import lombok.Getter;

@Getter
public class LoginResponse {

    private final String tokenType = "Bearer";
    private final String accessToken;

    // 클라이언트 편의를 위한 로그인 사용자 요약
    private final Long userId;
    private final String username;
    private final String name;
    private final UserRole role;
    private final Long tenantId;               // 소셜 미완성(PENDING) 유저면 null

    // 가입 완료 여부 — false면 프론트가 '회사 등록 페이지'로 유도(케이스 A)
    private final boolean registrationComplete;

    public LoginResponse(String accessToken, User user) {
        this.accessToken = accessToken;
        this.userId = user.getId();
        this.username = user.getUsername();
        this.name = user.getName();
        this.role = user.getRole();
        this.tenantId = (user.getTenant() != null) ? user.getTenant().getId() : null;
        this.registrationComplete = user.isRegistrationComplete();
    }
}
