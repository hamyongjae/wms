package com.example.wms.warehouse.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class WarehouseCreateRequest {

    // tenantId는 더 이상 받지 않는다 — 로그인 토큰에서 자동 결정(테넌트 격리)

    @NotBlank(message = "창고명은 필수입니다")
    private String name;

    private String address;
    private String phone;
}