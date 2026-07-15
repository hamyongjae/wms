package com.example.wms.billing.dto;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.support.ProrationCalculator.MidReleaseResult;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 중도 출고 정산 결과 응답.
 * 실제 사용분/환급/추가청구와, 정산 반영 후 원장 상태를 함께 담는다.
 */
@Getter
public class MidReleaseSettlementResponse {

    private final BigDecimal actualUsageAmount;
    private final BigDecimal refundAmount;
    private final BigDecimal additionalChargeAmount;
    private final LocalDate effectiveEndDate;
    private final BillingLedgerResponse ledger;

    public MidReleaseSettlementResponse(MidReleaseResult result, BillingLedger ledger) {
        this.actualUsageAmount = result.actualUsageAmount();
        this.refundAmount = result.refundAmount();
        this.additionalChargeAmount = result.additionalChargeAmount();
        this.effectiveEndDate = result.effectiveEndDate();
        this.ledger = new BillingLedgerResponse(ledger);
    }
}
