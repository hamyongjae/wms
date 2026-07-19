package com.example.wms.tenant.dto;

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

    // 기본 계약 유지 기간(일) — 출고예정일 기본값 산정용 (미지정 시 기존값 유지)
    private Integer defaultStoragePeriodDays;
}