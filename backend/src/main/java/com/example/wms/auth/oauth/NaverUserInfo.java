package com.example.wms.auth.oauth;

import com.example.wms.user.entity.LoginProvider;

import java.util.Map;

/**
 * 네이버 OAuth2 응답 파서.
 *
 * 네이버 응답은 "response" 키 아래에 실제 정보가 담긴다.
 * 예: { "resultcode": "00", "message": "success",
 *       "response": { "id": "abc", "email": "a@naver.com", "name": "홍길동" } }
 */
public class NaverUserInfo implements OAuth2UserInfo {

    private final Map<String, Object> response;   // "response" 하위 맵

    @SuppressWarnings("unchecked")
    public NaverUserInfo(Map<String, Object> attributes) {
        Object res = attributes.get("response");
        this.response = (res instanceof Map<?, ?> map)
                ? (Map<String, Object>) map
                : attributes;   // 이미 response 하위를 넘긴 경우도 허용
    }

    @Override
    public String getProviderId() {
        return asString(response.get("id"));
    }

    @Override
    public LoginProvider getProvider() {
        return LoginProvider.NAVER;
    }

    @Override
    public String getEmail() {
        return asString(response.get("email"));
    }

    @Override
    public String getName() {
        return asString(response.get("name"));
    }

    private String asString(Object value) {
        return value != null ? value.toString() : null;
    }
}
