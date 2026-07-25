package com.example.wms.auth.dto;

import com.example.wms.common.validation.ValidationPatterns;
import com.example.wms.user.entity.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class SignUpRequest {

    // tenantId는 더 이상 받지 않는다 — 로그인한 ADMIN의 회사로 자동 지정

    // [이메일 ID] 직원 로그인 아이디 = 이메일
    @NotBlank(message = "이메일은 필수입니다")
    @Email(message = ValidationPatterns.EMAIL_MESSAGE)
    private String email;

    @NotBlank(message = "비밀번호는 필수입니다")
    @Pattern(regexp = ValidationPatterns.PASSWORD, message = ValidationPatterns.PASSWORD_MESSAGE)
    private String password;

    @NotBlank(message = "이름은 필수입니다")
    private String name;

    // 미지정 시 서비스에서 STAFF로 처리
    private UserRole role;
}
