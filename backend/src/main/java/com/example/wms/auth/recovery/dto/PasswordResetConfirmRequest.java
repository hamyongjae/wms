package com.example.wms.auth.recovery.dto;

import com.example.wms.common.validation.ValidationPatterns;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 비밀번호 재설정 확정: 토큰 + 새 비밀번호. */
@Getter
@NoArgsConstructor
public class PasswordResetConfirmRequest {

    @NotBlank(message = "토큰은 필수입니다")
    private String token;

    // 앞서 정의한 비밀번호 규칙(영문·숫자·특수문자 8~20자)을 그대로 재사용
    @NotBlank(message = "새 비밀번호는 필수입니다")
    @Pattern(regexp = ValidationPatterns.PASSWORD, message = ValidationPatterns.PASSWORD_MESSAGE)
    private String newPassword;
}
