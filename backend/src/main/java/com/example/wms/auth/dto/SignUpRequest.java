package com.example.wms.auth.dto;

import com.example.wms.common.validation.ValidationPatterns;
import com.example.wms.user.entity.UserRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class SignUpRequest {

    // tenantId는 더 이상 받지 않는다 — 로그인한 ADMIN의 회사로 자동 지정

    @NotBlank(message = "아이디는 필수입니다")
    @Pattern(regexp = ValidationPatterns.USERNAME, message = ValidationPatterns.USERNAME_MESSAGE)
    private String username;

    @NotBlank(message = "비밀번호는 필수입니다")
    @Pattern(regexp = ValidationPatterns.PASSWORD, message = ValidationPatterns.PASSWORD_MESSAGE)
    private String password;

    @NotBlank(message = "이름은 필수입니다")
    private Stri