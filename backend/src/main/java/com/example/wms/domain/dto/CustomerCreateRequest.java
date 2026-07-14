package com.example.wms.domain.dto;

import com.example.wms.domain.entity.CustomerType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CustomerCreateRequest {

    @NotNull(message = "소속 업체 id는 필수입니다")
    private Long tenantId;

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