package com.example.wms.domain.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class StorageOrderCreateRequest {

    @NotNull(message = "고객 id는 필수입니다")
    private Long customerId;

    @NotNull(message = "창고 id는 필수입니다")
    private Long warehouseId;

    @NotNull(message = "보관 시작일은 필수입니다")
    private LocalDate storageStartDate;

    private LocalDate expectedEndDate;

    @NotNull(message = "월 보관료는 필수입니다")
    private Integer monthlyFee;

    private Double totalVolume;
    private String memo;
}