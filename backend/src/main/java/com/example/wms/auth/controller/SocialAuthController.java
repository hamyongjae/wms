package com.example.wms.auth.controller;

import com.example.wms.auth.dto.CompanyProfileRequest;
import com.example.wms.auth.dto.LoginResponse;
import com.example.wms.auth.dto.StaffInviteRequest;
import com.example.wms.auth.service.SocialAuthService;
import com.example.wms.auth.service.StaffInviteService;
import com.example.wms.security.UserPrincipal;
import com.example.wms.user.entity.LoginProvider;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 소셜 로그인/가입 통합 컨트롤러.
 *
 * [통합 진입점] POST /api/auth/social/login/{provider}
 *   실제 운영에서는 Spring Security OAuth2 로그인 성공 핸들러가 provider 응답(attributes)을
 *   받아 SocialAuthService.loginOrRegister를 호출한다. 본 엔드포인트는 그 진입점을 그대로
 *   노출해, OAuth2 스타터를 붙이기 전에도 흐름을 검증/연동할 수 있게 한다.
 */
@RestController
@RequestMapping("/api/auth/social")
@RequiredArgsConstructor
public class SocialAuthController {

    private final SocialAuthService socialAuthService;
    private final StaffInviteService staffInviteService;

    // 소셜 로그인/최초가입 진입 — 공개. body = 소셜 플랫폼 원시 attributes(JSON).
    // provider는 대소문자 무관(google/GOOGLE 모두 허용).
    @PostMapping("/login/{provider}")
    public ResponseEntity<LoginResponse> socialLogin(
            @PathVariable("provider") String provider,
            @RequestBody Map<String, Object> attributes) {

        LoginProvider loginProvider = parseProvider(provider);
        LoginResponse response = socialAuthService.loginOrRegister(loginProvider, attributes);
        return ResponseEntity.ok(response);
    }

    private LoginProvider parseProvider(String provider) {
        try {
            LoginProvider p = LoginProvider.valueOf(provider.trim().toUpperCase());
            if (p == LoginProvider.LOCAL) {
                throw new IllegalArgumentException("소셜 제공자가 아닙니다: " + provider);
            }
            return p;
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("지원하지 않는 소셜 제공자입니다: " + provider);
        }
    }

    // [케이스 A] PENDING 유저의 회사 등록 → ADMIN 승격 (토큰 필요)
    @PostMapping("/register-company")
    public ResponseEntity<LoginResponse> registerCompany(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CompanyProfileRequest request) {

        LoginResponse response =
                socialAuthService.completeCompanyRegistration(principal.getUserId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // [케이스 B] 직원 초대 등록 — ADMIN 전용
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/invites")
    public ResponseEntity<Long> inviteStaff(@Valid @RequestBody StaffInviteRequest request) {
        Long inviteId = staffInviteService.invite(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(inviteId);
    }
}
