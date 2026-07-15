package com.example.wms.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Swagger UI(springdoc) 설정.
 *
 * 목적: 화면 우측에 "Authorize" 버튼을 띄워서
 * 로그인으로 받은 JWT 토큰을 한 번만 넣으면,
 * 이후 모든 요청 헤더에 자동으로 'Authorization: Bearer <토큰>'이 붙게 한다.
 * → 프론트 없이 Swagger만으로 로그인→등록→조회 전체 흐름을 클릭 테스트 가능.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI wmsOpenAPI() {
        final String schemeName = "bearerAuth";

        return new OpenAPI()
                .info(new Info()
                        .title("WMS API")
                        .version("v0.0.1")
                        .description("창고 관리 시스템(WMS) REST API 문서"))
                // 모든 API에 이 인증 방식을 기본 적용
                .addSecurityItem(new SecurityRequirement().addList(schemeName))
                // "Authorize" 버튼 = HTTP Bearer(JWT) 방식
                .components(new Components().addSecuritySchemes(schemeName,
                        new SecurityScheme()
                                .name(schemeName)
                                .type(SecurityScheme.Type.HTTP)   // HTTP 인증
                                .scheme("bearer")                 // Bearer 토큰
                                .bearerFormat("JWT")));
    }
}
