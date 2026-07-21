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
    // [파생 연체/미수] 상태 enum을 늘리지 않고(회계 원장 진실 보존 + DDL 마이그레이션 회피),
    //   납기 경과 + 미납 잔액을 실시간 계산해 노출한다. 프론트 미수금 파이프라인이 이 값을 소비한다.
    private final boolean overdue;     // 납기 경과 && 잔액>0 && 미완납(ISSUED/PARTIALLY_PAID)
    private final long daysOverdue;    // 납기 경과 일수 (연체 아니면 0)

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

        // [연체 파생 계산] 오늘 기준 납기 경과 + 미납 잔액이 있으면 연체/미수로 판정.
        boolean unpaid = (l.getStatus() == BillingStatus.ISSUED
                || l.getStatus() == BillingStatus.PARTIALLY_PAID)
                && l.getBalance() != null && l.getBalance().signum() > 0;
        boolean duePassed = l.getDueDate() != null && l.getDueDate().isBefore(LocalDate.now());
        this.overdue = unpaid && duePassed;
        this.daysOverdue = this.overdue
                ? java.time.temporal.ChronoUnit.DAYS.between(l.getDueDate(), LocalDate.now())
                : 0L;

        this.carriedOverToLedgerId =
                l.getCarriedOverToLedger() != null ? l.getCarriedOverToLedger().getId() : null;
        this.version = l.getVersion();
        this.createdAt = l.getCreatedAt();
        this.updatedAt = l.getUpdatedAt();
    }
}
