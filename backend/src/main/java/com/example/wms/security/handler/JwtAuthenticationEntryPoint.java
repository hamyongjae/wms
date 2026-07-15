package com.example.wms.security.handler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 인증 실패(=신분 미확인) 시 호출 → 401 Unauthorized.
 *
 * "로그인 안 함 / 토큰 없음 / 토큰 만료·위조" 처럼
 * 아예 누구인지 확인이 안 되는 경우를 담당한다.
 * (권한 부족 403은 AccessDeniedHandler가 별도로 처리 — 역할 분리)
 *
 * JSON은 라이브러리 버전에 흔들리지 않도록 직접 만들어 내려준다.
 * 응답 형태는 ErrorResponse와 동일: {"status":401,"message":"..."}
 */
@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request,
                         HttpServletResponse response,
                         AuthenticationException authException) throws IOException {

        response.setStatus(HttpStatus.UNAUTHORIZED.value());     // 401
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        String json = String.format(
                "{\"status\": %d, \"message\": \"%s\"}",
                HttpStatus.UNAUTHORIZED.value(),
                "인증이 필요합니다. 로그인 후 발급받은 토큰을 담아 요청하세요.");

        response.getWriter().write(json);
    }
}
