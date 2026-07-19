package com.example.wms.order.dto;

import com.example.wms.billing.entity.SettlementType;
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

    // 결제 방식 — PREPAID(선불)면 계약 등록과 동시에 청구·수금까지 자동 처리. 미지정 시 후불.
    private SettlementType paymentType;
}