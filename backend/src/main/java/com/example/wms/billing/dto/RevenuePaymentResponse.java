package com.example.wms.billing.dto;

import com.example.wms.billing.entity.PaymentHistory;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * [매출관리 - 현금주의 입금일 기준] 청구기간에 걸쳐 일할로 나누지 않고, 실제 입금이 찍힌
 * 날짜(paidOn) 그대로 매출로 잡기 위한 원시 입금 내역. 고객·계약 정보를 함께 내려보내
 * 프론트가 별도 조인 없이 기간·고객별로 바로 집계할 수 있게 한다.
 */
@Getter
public class RevenuePaymentResponse {

    private final Long id;
    private final Long billingLedgerId;
    private final Long storageOrderId;
    private final Long customerId;
    private final String customerName;
    private final BigDecimal amount;
    private final LocalDate paidOn;

    public RevenuePaymentResponse(PaymentHistory p) {
        this.id = p.getId();
        this.billingLedgerId = p.getBillingLedger().getId();
        this.storageOrderId = p.getBillingLedger().getStorageOrder().getId();
        this.customerId = p.getBillingLedger().getCustomer().getId();
        this.customerName = p.getBillingLedger().getCustomer().getName();
        this.amount = p.getAmount();
        this.paidOn = p.getPaidOn();
    }
}
