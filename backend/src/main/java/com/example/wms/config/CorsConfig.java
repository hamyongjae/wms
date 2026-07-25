package com.example.wms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.ArrayList;
import java.util.Arrays;
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

    // [운영] 실제 도메인을 콤마로 주입(APP_CORS_ORIGINS). 예: https://wms.example.com,https://www.wms.example.com
    @Value("${app.cors.allowed-origins:}")
    private String extraOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        // [개발/모바일] 사설망(LAN) 어느 기기에서 접속해도 허용되도록 IP 대역 패턴 사용.
        //   - localhost: PC 개발
        //   - 192.168.x.x / 10.x.x.x / 172.16~31.x.x: 공유기 사설망(모바일 테스트)
        //   - *.trycloudflare.com / *.ngrok-free.app: 터널링(HTTPS) 접속
        //   운영 배포 시 실제 도메인을 여기에 추가한다.
        List<String> patterns = new ArrayList<>(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "http://192.168.*.*:*",
                "http://10.*.*.*:*",
                "http://172.16.*.*:*", "http://172.17.*.*:*", "http://172.18.*.*:*", "http://172.19.*.*:*",
                "http://172.20.*.*:*", "http://172.21.*.*:*", "http://172.22.*.*:*", "http://172.23.*.*:*",
                "http://172.24.*.*:*", "http://172.25.*.*:*", "http://172.26.*.*:*", "http://172.27.*.*:*",
                "http://172.28.*.*:*", "http://172.29.*.*:*", "http://172.30.*.*:*", "http://172.31.*.*:*",
                "https://*.trycloudflare.com",
                "https://*.ngrok-free.app"
        ));
        // [운영] 환경변수로 주입한 실제 도메인들을 추가
        if (extraOrigins != null && !extraOrigins.isBlank()) {
            for (String o : Arrays.asList(extraOrigins.split(","))) {
                if (!o.isBlank()) patterns.add(o.trim());
            }
        }
        config.setAllowedOriginPatterns(patterns);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));      // Authorization, Content-Type 등 모두 허용
        config.setExposedHeaders(List.of("Authorization"));
        config.setMaxAge(3600L);                     // preflight 캐시 1시간

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
