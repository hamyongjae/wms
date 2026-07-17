package com.example.wms.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * [방식 1] 로그인 요청.
 * 클라이언트는 오직 아이디/비밀번호만 보낸다.
 * 소속 업체(tenantId)는 서버가 username 으로 자동 해석하므로 받지 않는다.
 */
@Getter
@NoArgsConstructor
public class LoginRequest {

    @NotBlank(message = "아이디는 필수입니다")
    private String username;

    @NotBlank(message = "비밀번호는 필수입니다")
    private String password;
}
