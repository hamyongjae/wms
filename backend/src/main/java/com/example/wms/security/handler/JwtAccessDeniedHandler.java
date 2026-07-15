package com.example.wms.security.handler;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 인가 실패(=신분은 확인됐지만 권한 부족) 시 호출 → 403 Forbidden.
 *
 * 예: STAFF 계정이 ADMIN 전용 API(@PreAuthorize("hasRole('ADMIN')"))에
 * 접근한 경우. "로그인은 했지만 이건 네 권한이 아니야"를 의미한다.
 *
 * 401(누구인지 모름)과 명확히 구분해서 처리하는 것이 요점.
 * 응답 형태는 ErrorResponse와 동일: {"status":403,"message":"..."}
 */
@Component
public class JwtAccessDeniedHandler implements AccessDeniedHandler {

    @Override
    public void handle(HttpServletRequest request,
                       HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {

        response.setStatus(HttpStatus.FORBIDDEN.value());        // 403
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());

        String json = String.format(
                "{\"status\": %d, \"message\": \"%s\"}",
                HttpStatus.FORBIDDEN.value(),
                "이 작업을 수행할 권한이 없습니다.");

        response.getWriter().write(json);
    }
}
