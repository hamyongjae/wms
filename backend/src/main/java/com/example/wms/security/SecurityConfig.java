package com.example.wms.security;

import com.example.wms.security.handler.JwtAccessDeniedHandler;
import com.example.wms.security.handler.JwtAuthenticationEntryPoint;
import com.example.wms.security.jwt.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * 보안 전반 설정.
 *
 * [설계 원칙]
 * - 무상태(STATELESS): 세션 없이 매 요청 토큰으로만 인증.
 * - 역할 분리: 인증실패(401)/인가실패(403) 응답을 별도 핸들러에 위임.
 * - 느슨한 결합: 필터·핸들러를 인터페이스/빈으로 주입받아 갈아끼우기 쉽게.
 * - 확장성: @EnableMethodSecurity 로 @PreAuthorize 등 메서드 단위 인가 지원.
 *   OAuth2 등 새 로그인 방식은 필터를 추가/교체하는 식으로 확장 가능.
 */
@Configuration
@EnableMethodSecurity   // @PreAuthorize("hasRole('ADMIN')") 같은 메서드 보안 활성화
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final JwtAuthenticationEntryPoint authenticationEntryPoint;  // 401 담당
    private final JwtAccessDeniedHandler accessDeniedHandler;            // 403 담당

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter,
                          JwtAuthenticationEntryPoint authenticationEntryPoint,
                          JwtAccessDeniedHandler accessDeniedHandler) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.authenticationEntryPoint = authenticationEntryPoint;
        this.accessDeniedHandler = accessDeniedHandler;
    }

    /** [보안] 비밀번호 단방향 암호화 — BCrypt를 빈으로 등록해 전역 사용. */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // REST + 토큰 방식이라 CSRF/폼로그인/기본인증 비활성화
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)

                // [무상태] 세션을 절대 만들지 않는다 — 서버는 토큰만 신뢰
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth
                        // 공개: 로그인 + 신규 업체 셀프 가입만
                        // (signup은 이제 ADMIN 전용이므로 여기서 제외 → 인증 필요)
                        .requestMatchers("/api/auth/login", "/api/auth/register-company").permitAll()
                        // Swagger 문서 공개
                        .requestMatchers(
                                "/swagger-ui/**",
                                "/swagger-ui.html",
                                "/v3/api-docs/**").permitAll()
                        // 그 외 전부 인증 필요
                        .anyRequest().authenticated())

                // [역할 분리] 인증실패=401(EntryPoint), 인가실패=403(AccessDeniedHandler)
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler))

                // JWT 필터를 기본 인증 필터 앞에 배치
                .addFilterBefore(jwtAuthenticationFilter,
                        UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
