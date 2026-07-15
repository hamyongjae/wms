package com.example.wms.billing.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class CarryOverRequest {

    @NotNull(message = "차월 기간 시작일은 필수입니다")
    private LocalDate nextPeriodStart;

    @NotNull(message = "차월 기간 종료일은 필수입니다")
    private LocalDate nextPeriodEnd;

    // 차월 기본 청구액. 미지정 시 계약 요금 기준으로 서버가 일할 계산.
    private BigDecimal nextBaseAmount;

    // 차월 원장 납기 (미지정 가능)
    private LocalDate nextDueDate;
}
