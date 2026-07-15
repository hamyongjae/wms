package com.example.wms.billing.dto;

import com.example.wms.billing.entity.PaymentHistory;
import com.example.wms.billing.entity.PaymentMethod;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
public class PaymentHistoryResponse {

    private final Long id;
    private final Long billingLedgerId;
    private final BigDecimal amount;
    private final PaymentMethod method;
    private final LocalDate paidOn;
    private final String memo;
    private final boolean reversed;
    private final Long performedByUserId;
    private final LocalDateTime createdAt;

    public PaymentHistoryResponse(PaymentHistory p) {
        this.id = p.getId();
        this.billingLedgerId = p.getBillingLedger().getId();
        this.amount = p.getAmount();
        this.method = p.getMethod();
        this.paidOn = p.getPaidOn();
        this.memo = p.getMemo();
        this.reversed = p.isReversed();
        this.performedByUserId = p.getPerformedByUserId();
        this.createdAt = p.getCreatedAt();
    }
}
