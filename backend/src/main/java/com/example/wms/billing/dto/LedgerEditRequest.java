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

    /** [선택] 보내면 현재 입금 누계와의 차액만큼 실제 입금으로 처리한다. 안 보내면 입금액은 그대로 둔다. */
    private BigDecimal paidAmount;

    /** [선택] paidAmount로 새로 생기는 입금 이력의 실제 입금일. 안 보내면 오늘 날짜로 처리한다. */
    private LocalDate paidOn;
}
