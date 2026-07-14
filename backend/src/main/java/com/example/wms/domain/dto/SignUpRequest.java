package com.example.wms.domain.dto;

import com.example.wms.domain.entity.UserRole;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class SignUpRequest {

    @NotNull(message = "소속 업체(tenantId)는 필수입니다")
    private Long tenantId;

    @NotBlank(message = "아이디는 필수입니다")
    @Size(min = 4, max = 50, message = "아이디는 4~50자여야 합니다")
    private String username;

    @NotBlank(message = "비밀번호는 필수입니다")
    @Size(min = 8, max = 64, message = "비밀번호는 8자 이상이어야 합니다")
    private String password;

    @NotBlank(message = "이름은 필수입니다")
    private String name;

    // 미지정 시 서비스에서 STAFF로 처리
    private UserRole role;
}
