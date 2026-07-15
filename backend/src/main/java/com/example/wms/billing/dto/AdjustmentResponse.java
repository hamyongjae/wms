package com.example.wms.billing.dto;

import com.example.wms.billing.entity.AdjustmentType;
import com.example.wms.billing.entity.BillingAdjustment;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Getter
public class AdjustmentResponse {

    private final Long id;
    private final Long billingLedgerId;
    private final AdjustmentType type;
    private final BigDecimal amount;      // 부호 있는 실제 적용 금액
    private final String reason;
    private final Long performedByUserId;
    private final LocalDateTime createdAt;

    public AdjustmentResponse(BillingAdjustment a) {
        this.id = a.getId();
        this.billingLedgerId = a.getBillingLedger().getId();
        this.type = a.getType();
        this.amount = a.getAmount();
        this.reason = a.getReason();
        this.performedByUserId = a.getPerformedByUserId();
        this.createdAt = a.getCreatedAt();
    }
}
