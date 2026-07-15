package com.example.wms.billing.dto;

import com.example.wms.billing.entity.BillingAdjustment;
import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.PaymentHistory;
import lombok.Getter;

import java.util.List;

/**
 * 원장 상세 응답: 원장 요약 + 수금 이력 + 조정 이력을 한 번에.
 * 사장님 화면에서 "이 청구건이 어떻게 흘러갔는지"를 한눈에 보여주기 위함.
 */
@Getter
public class BillingLedgerDetailResponse {

    private final BillingLedgerResponse ledger;
    private final List<PaymentHistoryResponse> payments;
    private final List<AdjustmentResponse> adjustments;

    public BillingLedgerDetailResponse(BillingLedger ledger,
                                       List<PaymentHistory> payments,
                                       List<BillingAdjustment> adjustments) {
        this.ledger = new BillingLedgerResponse(ledger);
        this.payments = payments.stream().map(PaymentHistoryResponse::new).toList();
        this.adjustments = adjustments.stream().map(AdjustmentResponse::new).toList();
    }
}
