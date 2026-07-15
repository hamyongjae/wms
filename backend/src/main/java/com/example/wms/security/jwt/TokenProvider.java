package com.example.wms.security.jwt;

import com.example.wms.user.entity.User;
import com.example.wms.security.UserPrincipal;

/**
 * 토큰 발급/검증 추상화.
 *
 * [확장성 포인트]
 * 필터·서비스는 이 인터페이스에만 의존한다(구현체를 직접 몰라도 됨).
 * 나중에 OAuth2(구글/카카오) 토큰이나 다른 서명 방식이 추가돼도
 * 새 구현체를 만들어 갈아끼우면 되고, JwtAuthenticationFilter·AuthService의
 * 코드는 손대지 않아도 된다. (느슨한 결합 / DIP)
 */
public interface TokenProvider {

    /** 로그인 성공한 사용자 정보를 담아 액세스 토큰 문자열을 만든다. */
    String createToken(User user);

    /**
     * 토큰을 검증하고 사용자 신분(UserPrincipal)으로 복원한다.
     * 유효하지 않으면 null을 반환한다.
     */
    UserPrincipal parse(String token);
}
