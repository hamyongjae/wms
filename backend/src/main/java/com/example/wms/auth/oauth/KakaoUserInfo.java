package com.example.wms.auth.oauth;

import com.example.wms.user.entity.LoginProvider;

import java.util.Map;

/**
 * 카카오 OAuth2 응답 파서.
 *
 * 카카오 응답은 중첩(nested) 구조다.
 * 예:
 * {
 *   "id": 12345678,
 *   "kakao_account": {
 *       "email": "a@kakao.com",
 *       "profile": { "nickname": "홍길동" }
 *   }
 * }
 */
public class KakaoUserInfo implements OAuth2UserInfo {

    private final Map<String, Object> attributes;

    public KakaoUserInfo(Map<String, Object> attributes) {
        this.attributes = attributes;
    }

    @Override
    public String getProviderId() {
        return asString(attributes.get("id"));   // 최상위 id
    }

    @Override
    public LoginProvider getProvider() {
        return LoginProvider.KAKAO;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String getEmail() {
        Object account = attributes.get("kakao_account");
        if (account instanceof Map<?, ?> map) {
            return asString(((Map<String, Object>) map).get("email"));
        }
        return null;
    }

    @Override
    @SuppressWarnings("unchecked")
    public String getName() {
        Object account = attributes.get("kakao_account");
        if (account instanceof Map<?, ?> map) {
            Object profile = ((Map<String, Object>) map).get("profile");
            if (profile instanceof Map<?, ?> p) {
                return asString(((Map<String, Object>) p).get("nickname"));
            }
        }
        return null;
    }

    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }
}
