package com.example.wms.yard.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 층별 자리 일괄 생성 요청.
 * 층(tier)마다 원하는 자리 개수(count)를 지정한다. (예: 1층 37, 2층 22, 3층 55)
 * 자리 번호는 층마다 1..count 로 매겨지고, 라벨은 "N층-번호"가 된다.
 */
@Getter
@NoArgsConstructor
public class FloorGridRequest {

    @NotNull(message = "창고(warehouseId)는 필수입니다")
    private Long warehouseId;

    @NotEmpty(message = "층 정보가 최소 1개는 필요합니다")
    @Valid
    private List<Floor> floors;

    @Getter
    @NoArgsConstructor
    public static class Floor {
        @NotNull @Positive(message = "층(tier)은 1 이상이어야 합니다")
        private Integer tier;

        @NotNull @Positive(message = "자리 개수(count)는 1 이상이어야 합니다")
        private Integer count;
    }
}
