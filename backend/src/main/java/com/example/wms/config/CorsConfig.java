package com.example.wms.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS 설정.
 *
 * 프론트(개발 서버 localhost:5173)가 다른 포트(백엔드 8080)를 호출하면
 * 브라우저가 기본적으로 막는다(Same-Origin Policy). 허용 출처·메서드·헤더를
 * 명시해 프론트에서 API를 부를 수 있게 한다.
 *
 * SecurityConfig의 http.cors() 가 이 빈을 자동으로 사용한다.
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // 개발용 프론트 출처 (운영 배포 시 실제 도메인 추가)
        config.setAllowedOrigins(List.of("http://localhost:5173"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));      // Authorization, Content-Type 등 모두 허용
        config.setExposedHeaders(List.of("Authorization"));
        config.setMaxAge(3600L);                     // preflight 캐시 1시간

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
