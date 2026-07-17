package com.example.wms.auth.dto;

import com.example.wms.user.entity.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * [케이스 B] 사장(ADMIN)이 직원을 미리 초대 등록할 때의 요청.
 * 여기 등록된 이메일의 소셜 계정으로 로그인하면 이 회사에 자동 매핑된다.
 */
@Getter
@NoArgsConstructor
public class StaffInviteRequest {

    @NotBlank(message = "초대할 직원의 이메일은 필수입니다")
    @Email(message = "이메일 형식이 올바르지 않습니다")
    private String email;

    private String name;

    // 미지정 시 STAFF
    private UserRole role;
}
