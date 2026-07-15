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
    private final Long tenantId;

    public LoginResponse(String accessToken, User user) {
        this.accessToken = accessToken;
        this.userId = user.getId();
        this.username = user.getUsername();
        this.name = user.getName();
        this.role = user.getRole();
        this.tenantId = user.getTenant().getId();
    }
}
