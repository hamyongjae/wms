package com.example.wms.domain.dto;

import com.example.wms.domain.entity.CustomerType;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CustomerCreateRequest {

    // tenantId는 더 이상 받지 않는다 — 로그인 토큰에서 자동 결정(테넌트 격리)

    @NotBlank(message = "고객명은 필수입니다")
    private String name;

    private CustomerType customerType;
    private String businessNumber;

    private String phoneNumber;
    private String email;
    private String emergencyContactName;
    private String emergencyContactPhone;

    private String originAddress;
    private String destinationAddress;
    private String postalCode;

    private boolean contractAgreed;
    private boolean disposalConsent;
    private String memo;
}