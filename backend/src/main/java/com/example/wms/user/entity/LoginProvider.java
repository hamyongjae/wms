package com.example.wms.user.entity;

/**
 * 로그인 제공자(가입 경로).
 *
 * [확장성] 신규 소셜 플랫폼이 추가돼도 이 enum에 상수만 늘리고
 * OAuth2UserInfo 구현체 하나만 붙이면 되도록 설계했다.
 * User 스키마·로그인 서비스의 나머지 로직은 그대로 재사용된다.
 */
public enum LoginProvider {
    LOCAL,   // 자체 가입 (username + password)
    GOOGLE,
    KAKAO,
    NAVER
}
