package com.example.wms.yard.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class SlotCreateRequest {

    @NotNull(message = "창고(warehouseId)는 필수입니다")
    private Long warehouseId;

    @NotBlank(message = "블록(구역)은 필수입니다")
    private String block;

    @NotNull @Positive(message = "열(row)은 1 이상이어야 합니다")
    private Integer rowNo;

    @NotNull @Positive(message = "연(column)은 1 이상이어야 합니다")
    private Integer columnNo;

    @NotNull @Positive(message = "단(tier)은 1 이상이어야 합니다")
    private Integer tier;
}
