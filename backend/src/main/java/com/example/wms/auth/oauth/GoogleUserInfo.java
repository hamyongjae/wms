package com.example.wms.auth.oauth;

import com.example.wms.user.entity.LoginProvider;

import java.util.Map;

/**
 * 구글 OAuth2 userinfo 응답 파서.
 *
 * 구글 응답은 평면(flat) 구조다.
 * 예: { "sub": "1029...", "email": "a@gmail.com", "name": "홍길동", ... }
 */
public class GoogleUserInfo implements OAuth2UserInfo {

    private final Map<String, Object> attributes;

    public GoogleUserInfo(Map<String, Object> attributes) {
        this.attributes = attributes;
    }

    @Override
    public String getProviderId() {
        return asString(attributes.get("sub"));
    }

    @Override
    public LoginProvider getProvider() {
        return LoginProvider.GOOGLE;
    }

    @Override
    public String getEmail() {
        return asString(attributes.get("email"));
    }

    @Override
    public String getName() {
        return asString(attributes.get("name"));
    }

    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }
}
