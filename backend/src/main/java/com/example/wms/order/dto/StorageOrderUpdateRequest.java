package com.example.wms.order.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class StorageOrderUpdateRequest {

    private LocalDate expectedEndDate;
    private Integer monthlyFee;
    private Double totalVolume;
    private String memo;
}