package com.example.wms.yard.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class FloorPriceUpsertRequest {

    @NotNull(message = "창고 id는 필수입니다")
    private Long warehouseId;

    @NotNull(message = "층(tier)은 필수입니다")
    private Integer tier;

    @NotNull(message = "단가는 필수입니다")
    @Min(value = 0, message = "단가는 0원 이상이어야 합니다")
    private Integer unitPrice;

    // 최소 보관료 (미지정 시 0 = 최소 보정 없음)
    @Min(value = 0, message = "최소 보관료는 0원 이상이어야 합니다")
    private Integer minFee;
}
