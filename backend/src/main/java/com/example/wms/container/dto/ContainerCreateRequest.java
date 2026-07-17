package com.example.wms.container.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class ContainerCreateRequest {

    @NotNull(message = "소속 창고(warehouseId)는 필수입니다")
    private Long warehouseId;

    @NotBlank(message = "컨테이너 번호는 필수입니다")
    private String containerNo;

    // 미지정 시 5톤으로 생성
    @Positive(message = "용량은 0보다 커야 합니다")
    private Integer capacityTon;