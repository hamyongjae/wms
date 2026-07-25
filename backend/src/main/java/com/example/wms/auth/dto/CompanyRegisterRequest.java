package com.example.wms.auth.dto;

import com.example.wms.common.validation.ValidationPatterns;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 신규 업체 셀프 가입 요청.
 * 회사(Tenant) 정보 + 첫 관리자(ADMIN) 계정을 한 번에 받는다.
 * 이 경로만 공개(비로그인 허용)이며, 여기서 만들어진 첫 계정이
 * 이후 자기 회사의 직원을 추가하는 관리자가 된다.
 */
@Getter
@NoArgsConstructor
public class CompanyRegisterRequest {

    // ===== 회사 정보 =====
    @NotBlank(message = "업체명은 필수입니다")
    private String companyName;

    @NotBlank(message = "사업자번호는 필수입니다")
    private String businessNumber;

    private String ceoName;
    private String phone;
    private String address;

    // ===== 첫 관리자 계정 =====
    // [이메일 ID] 로그인 아이디 = 이메일. 전역 유일 식별자로 사용.
    @NotBlank(message = "이메일은 필수입니다")
    @Email(message = ValidationPatterns.EMAIL_MESSAGE)
    private String email;

    @NotBlank(message = "비밀번호는 필수입니다")
    @Pattern(regexp = ValidationPatterns.PASSWORD, message = ValidationPatterns.PASSWORD_MESSAGE)
    private String adminPassword;

    @NotBlank(message = "관리자 이름은 필수입니다")
    private String adminName;
}
