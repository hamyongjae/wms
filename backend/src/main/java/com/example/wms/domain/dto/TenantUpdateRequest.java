package com.example.wms.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class TenantUpdateRequest {

    @NotBlank(message = "업체명은 필수입니다")
    private String name;

    private String ceoName;
    private String phone;
    private String email;
    private String address;
}