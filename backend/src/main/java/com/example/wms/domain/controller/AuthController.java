package com.example.wms.domain.controller;

import com.example.wms.domain.dto.LoginRequest;
import com.example.wms.domain.dto.LoginResponse;
import com.example.wms.domain.dto.SignUpRequest;
import com.example.wms.domain.dto.UserResponse;
import com.example.wms.domain.service.AuthService;
import com.example.wms.security.UserPrincipal;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    // 직원 계정 생성 (POST /api/auth/signup)
    @PostMapping("/signup")
    public ResponseEntity<UserResponse> signUp(
            @Valid @RequestBody SignUpRequest request) {

        UserResponse response = authService.signUp(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
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
