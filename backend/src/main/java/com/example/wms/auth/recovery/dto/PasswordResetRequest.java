package com.example.wms.auth.recovery.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 비밀번호 재설정 요청(메일 발송): 아이디 + 이메일. */
@Getter
@NoArgsConstructor
public class PasswordResetRequest {

    @NotBlank(message = "아이디는 필수입니다")
    private String username;

    @NotBlank(message = "이메일은 필수입니다")
    @Email(message = "이메일 형식이 올바르지 않습니다")
    private String email;
}
