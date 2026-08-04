package com.example.wms.billing.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

/** [정산 일정 수정] 원장의 청구기간·기본 청구액을 직접 고칠 때 세 값을 모두 명시적으로 받는다. */
@Getter
@NoArgsConstructor
public class LedgerEditRequest {

    @NotNull(message = "청구 기간 시작일은 필수입니다")
    private LocalDate periodStart;

    @NotNull(message = "청구 기간 종료일은 필수입니다")
    private LocalDate periodEnd;

    @NotNull(message = "청구액은 필수입니다")
    private BigDecimal baseAmount;
}
