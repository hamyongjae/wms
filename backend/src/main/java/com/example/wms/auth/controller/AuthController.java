package com.example.wms.auth.controller;

import com.example.wms.auth.dto.CompanyRegisterRequest;
import com.example.wms.auth.dto.LoginRequest;
import com.example.wms.auth.dto.LoginResponse;
import com.example.wms.auth.dto.SignUpRequest;
import com.example.wms.auth.dto.UserResponse;
import com.example.wms.auth.service.AuthService;
import com.example.wms.security.UserPrincipal;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // 신규 업체 셀프 가입 (POST /api/auth/register-company) — 공개
    // 회사 + 첫 관리자(ADMIN)를 만들고, 바로 쓸 수 있게 토큰을 반환
    @PostMapping("/register-company")
    public ResponseEntity<LoginResponse> registerCompany(
            @Valid @RequestBody CompanyRegisterRequest request) {

        LoginResponse response = authService.registerCompany(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 직원 계정 추가 (POST /api/auth/signup-staff) — ADMIN 전용, 자기 회사에만
    // tenantId는 요청 값이 아니라 로그인한 ADMIN의 토큰에서 상속된다.
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/signup-staff")
    public ResponseEntity<UserResponse> signUpStaff(
            @Valid @RequestBody SignUpRequest request) {

        UserResponse response = authService.signUpStaff(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 내 업체 직원/관리자 목록 (GET /api/auth/staff) — ADMIN 전용
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/staff")
    public ResponseEntity<java.util.List<UserResponse>> listStaff() {
        return ResponseEntity.ok(authService.listStaff());
    }

    // 직원 주거래 계좌 등록·수정 (PATCH /api/auth/staff/{id}/account) — ADMIN 전용
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/staff/{id}/account")
    public ResponseEntity<UserResponse> updateStaffAccount(
            @PathVariable Long id,
            @RequestBody com.example.wms.auth.dto.StaffAccountRequest request) {
        return ResponseEntity.ok(authService.updateStaffAccount(id, request));
    }

    // 로그인 (POST /api/auth/login) → JWT 반환
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request) {

        LoginResponse response = authService.login(request);
        return ResponseEntity.ok(response);
    }

    // 내 정보 (GET /api/auth/me) — 토큰 필요
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(
            @AuthenticationPrincipal UserPrincipal principal) {

        UserResponse response = authService.getMe(principal.getUserId());
        return ResponseEntity.ok(response);
    }
}
