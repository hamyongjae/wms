package com.example.wms.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * 현재 로그인한 사용자 정보를 꺼내는 헬퍼.
 *
 * [테넌트 격리의 핵심]
 * 클라이언트가 보낸 tenantId를 믿지 않고,
 * 토큰에서 복원된 UserPrincipal의 tenantId만 신뢰한다.
 * 서비스 계층은 항상 이 값으로 "내 회사 데이터"만 다루게 된다.
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    /** 현재 로그인한 사용자의 소속 tenantId */
    public static Long getCurrentTenantId() {
        return getCurrentUser().getTenantId();
    }

    /** 현재 로그인한 사용자(UserPrincipal) */
    public static UserPrincipal getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null
                || !(authentication.getPrincipal() instanceof UserPrincipal principal)) {
            // 인증 필터를 통과한 요청에서만 호출되므로 정상 흐름에선 발생하지 않음
            throw new IllegalStateException("인증 정보가 없습니다.");
        }
        return principal;
    }
}
