package com.example.wms.auth.recovery.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 아이디 찾기 요청: 이름 + 이메일. */
@Getter
@NoArgsConstructor
public class FindUsernameRequest {

    @NotBlank(message = "이름은 필수입니다")
    private String name;

    @NotBlank(message = "이메일은 필수입니다")
    @Email(message = "이메일 형식이 올바르지 않습니다")
    private String email;
}
