package com.example.wms.security.jwt;

import com.example.wms.security.UserPrincipal;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 모든 요청에서 한 번 실행되어 토큰을 확인하는 필터.
 *
 * [확장성 포인트]
 * 구체 클래스(JwtTokenProvider)가 아니라 TokenProvider 인터페이스에 의존한다.
 * 토큰 방식이 바뀌어도 이 필터는 그대로 재사용된다.
 *
 * 이 필터는 인증(신분 확인)만 하고, 인가 실패(권한 부족)나
 * 인증 실패에 대한 '응답 생성'은 하지 않는다.
 * → 응답은 EntryPoint/AccessDeniedHandler가 담당(역할 분리).
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String PREFIX = "Bearer ";

    private final TokenProvider tokenProvider;   // 인터페이스 의존

    public JwtAuthenticationFilter(TokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String token = resolveToken(request);

        if (token != null) {
            UserPrincipal principal = tokenProvider.parse(token);
            if (principal != null) {
                // 토큰이 유효하면 SecurityContext에 인증 정보를 심는다.
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                principal, null, principal.getAuthorities());
                authentication.setDetails(
                        new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
        }

        // 인증이 안 됐어도 여기서 막지 않는다.
        // 뒤의 인가 단계에서 걸리면 EntryPoint(401)가 응답을 만든다.
        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(HEADER);
        if (header != null && header.startsWith(PREFIX)) {
            return header.substring(PREFIX.length());
        }
        return null;
    }
}
