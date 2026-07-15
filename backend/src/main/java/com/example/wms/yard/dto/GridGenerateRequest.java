package com.example.wms.yard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class GridGenerateRequest {

    @NotNull(message = "창고(warehouseId)는 필수입니다")
    private Long warehouseId;

    @NotBlank(message = "블록(구역)은 필수입니다")
    private String block;

    @NotNull @Positive(message = "행 수(rows)는 1 이상이어야 합니다")
    private Integer rows;

    @NotNull @Positive(message = "열 수(columns)는 1 이상이어야 합니다")
    private Integer columns;

    @NotNull @Positive(message = "단 수(tiers)는 1 이상이어야 합니다")
    private Integer tiers;
}
