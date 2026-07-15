package com.example.wms.billing.dto;

import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class LedgerCreateRequest {

    @NotNull(message = "대상 계약(storageOrderId)은 필수입니다")
    private Long storageOrderId;

    @NotNull(message = "청구 방식(billingType)은 필수입니다")
    private BillingType billingType;

    @NotNull(message = "정산 방식(settlementType)은 필수입니다")
    private SettlementType settlementType;

    @NotNull(message = "청구 기간 시작일은 필수입니다")
    private LocalDate periodStart;

    @NotNull(message = "청구 기간 종료일은 필수입니다")
    private LocalDate periodEnd;

    // 미지정 시 서버가 계약 요금 기준으로 일할 계산해 산정
    private BigDecimal baseAmount;

    // 일 단위(DAILY) 계약일 때 일 단가 (MONTHLY면 무시)
    private BigDecimal dailyRate;

    // 전월 이월 미수금 (보통 0, 이월 생성 시에만 사용)
    private BigDecimal carriedOverIn;

    // 납기 (미지정 가능)
    private LocalDate dueDate;
}
