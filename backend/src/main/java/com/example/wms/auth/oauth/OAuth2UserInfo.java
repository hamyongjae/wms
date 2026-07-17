package com.example.wms.auth.oauth;

import com.example.wms.user.entity.LoginProvider;

/**
 * 소셜 플랫폼별로 제각각인 사용자 정보 JSON을 공통 규격으로 흡수하는 추상화.
 *
 * [확장성 핵심]
 * 구글/카카오/네이버는 응답 JSON 구조가 전부 다르다(평면/중첩/키 이름 상이).
 * 상위 서비스(SocialAuthService)는 이 인터페이스에만 의존하므로,
 * 신규 플랫폼이 추가되거나 응답 스펙이 바뀌어도 구현체 하나만 추가/수정하면 되고
 * 가입/로그인 비즈니스 로직은 손대지 않는다. (OCP)
 */
public interface OAuth2UserInfo {

    /** 소셜 플랫폼이 부여한 고유 식별자 (플랫폼 내 유일). */
    String getProviderId();

    /** 어떤 플랫폼인지. */
    LoginProvider getProvider();

    /** 이메일 (테넌트 매칭/직원 초대의 키). 플랫폼 동의 항목에 따라 없을 수 있음. */
    String getEmail();

    /** 표시 이름. */
    String getName();
}
