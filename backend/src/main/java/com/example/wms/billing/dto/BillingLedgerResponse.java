package com.example.wms.billing.dto;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
public class BillingLedgerResponse {

    private final Long id;
    private final Long tenantId;
    private final Long storageOrderId;
    private final Long customerId;
    private final String customerName;
    private final String ledgerNo;

    private final BillingType billingType;
    private final SettlementType settlementType;
    private final LocalDate periodStart;
    private final LocalDate periodEnd;
    private final LocalDate dueDate;

    private final BigDecimal baseAmount;
    private final BigDecimal carriedOverIn;
    private final BigDecimal adjustmentTotal;
    private final BigDecimal paidTotal;
    private final BigDecimal balance;

    private final BillingStatus status;
    private final Long carriedOverToLedgerId;
    private final Long version;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public BillingLedgerResponse(BillingLedger l) {
        this.id = l.getId();
        this.tenantId = l.getTenant().getId();
        this.storageOrderId = l.getStorageOrder().getId();
        this.customerId = l.getCustomer().getId();
        this.customerName = l.getCustomer().getName();
        this.ledgerNo = l.getLedgerNo();
        this.billingType = l.getBillingType();
        this.settlementType = l.getSettlementType();
        this.periodStart = l.getBillingPeriodStart();
        this.periodEnd = l.getBillingPeriodEnd();
        this.dueDate = l.getDueDate();
        this.baseAmount = l.getBaseAmount();
        this.carriedOverIn = l.getCarriedOverIn();
        this.adjustmentTotal = l.getAdjustmentTotal();
        this.paidTotal = l.getPaidTotal();
        this.balance = l.getBalance();
        this.status = l.getStatus();
        this.carriedOverToLedgerId =
                l.getCarriedOverToLedger() != null ? l.getCarriedOverToLedger().getId() : null;
        this.version = l.getVersion();
        this.createdAt = l.getCreatedAt();
        this.updatedAt = l.getUpdatedAt();
    }
}
