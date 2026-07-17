package com.example.wms.auth.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * [케이스 A] 소셜로 인증된 PENDING 유저가 '회사 등록'으로 가입을 완료할 때 쓰는 요청.
 * 관리자 계정은 이미 (소셜 유저로) 존재하므로 회사 정보만 받는다.
 */
@Getter
@NoArgsConstructor
public class CompanyProfileRequest {

    @NotBlank(message = "업체명은 필수입니다")
    private String companyName;

    @NotBlank(message = "사업자번호는 필수입니다")
    private String businessNumber;

    private String ceoName;
    private String phone;
    private String email;
    private String address;
}
