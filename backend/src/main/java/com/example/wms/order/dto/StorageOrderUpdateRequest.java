package com.example.wms.order.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class StorageOrderUpdateRequest {

    private LocalDate storageStartDate;   // 보관 시작일 (편집 허용)
    private LocalDate expectedEndDate;
    private Integer monthlyFee;
    private Double totalVolume;
    private String memo;
}