package com.example.wms.auth.oauth;

import com.example.wms.user.entity.LoginProvider;

import java.util.Map;

/**
 * provider 종류에 맞는 OAuth2UserInfo 구현체를 만들어 주는 팩토리.
 *
 * [확장성] 신규 플랫폼 추가 시 여기 분기 한 줄 + 구현체 하나만 추가하면 된다.
 * 상위 서비스는 provider와 원시 attributes만 넘기고 파싱 방식은 전혀 몰라도 된다.
 */
public final class OAuth2UserInfoFactory {

    private OAuth2UserInfoFactory() {
    }

    public static OAuth2UserInfo of(LoginProvider provider, Map<String, Object> attributes) {
        return switch (provider) {
            case GOOGLE -> new GoogleUserInfo(attributes);
            case KAKAO -> new KakaoUserInfo(attributes);
            case NAVER -> new NaverUserInfo(attributes);
            case LOCAL -> throw new IllegalArgumentException("LOCAL은 소셜 제공자가 아닙니다.");
        };
    }
}
