package com.example.wms.domain.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class WarehouseUpdateRequest {

    @NotBlank(message = "창고명은 필수입니다")
    private String name;

    private String address;
    private String phone;
}