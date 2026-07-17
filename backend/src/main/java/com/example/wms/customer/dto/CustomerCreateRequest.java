package com.example.wms.customer.dto;

import com.example.wms.customer.entity.CustomerType;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 고객 등록 요청 (슬림).
 * tenantId는 로그인 토큰에서 자동 결정 — 클라이언트가 지정하지 않는다.
 * [슬림화] 주소/우편번호/비상연락/동의 필드 제거 — 화주 관리 핵심만.
 */
@Getter
@NoArgsConstructor
public class CustomerCreateRequest {

    @NotBlank(message = "고객명은 필수입니다")
    private String name;

    private CustomerType customerType;
    private String businessNumber;
    private String phoneNumber;
    private String email;
    private String memo;
}
