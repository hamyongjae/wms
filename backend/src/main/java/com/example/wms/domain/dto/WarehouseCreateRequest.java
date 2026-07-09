package com.example.wms.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class WarehouseCreateRequest {

    @NotNull(message = "소속 업체 id는 필수입니다")
    private Long tenantId;          // 어느 업체 소속인지

    @NotBlank(message = "창고명은 필수입니다")
    private String name;

    private String address;
    private String phone;
}