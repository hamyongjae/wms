package com.example.wms.billing.dto;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import lombok.Getter;
import lombok.Setter;

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
    private final String warehouseName;
    // [배치 조회] 현재 적재 위치(예: "2층-11")는 슬롯 점유 현황을 봐야 알 수 있어 생성자에서
    //   바로 못 채운다 — 서비스가 여러 원장을 한 번에 조회한 뒤 일괄로 채워 넣는다(N+1 방지).
    @Setter
    private String location;

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
    // [계정 과목 분리] 미수금(양수 잔액)과 환불 대상(음수 잔액의 절대값)을 명확히 나눠 노출
    private final BigDecimal outstanding;   // 실제 미수금 (balance>0), 음수면 0
    private final BigDecimal refundDue;     // 환불(선급금 반환) 대상 (balance<0), 양수면 0
    private final boolean refundCompleted;  // 환불 완료 처리 여부 (지급 후 마감)
    private final LocalDateTime refundedAt;  // 환불 완료 시각 (미완료면 null)

    private final boolean taxInvoiceIssued;      // 세금계산서 발행 여부 (관리자가 수동 체크)
    private final LocalDateTime taxInvoiceIssuedAt;  // 발행 처리 시각 (미발행이면 null)

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
        this.warehouseName = l.getStorageOrder().getWarehouse().getName();
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
        this.outstanding = l.outstandingBalance();
        this.refundDue = l.refundDue();
        this.refundCompleted = l.isRefundCompleted();
        this.refundedAt = l.getRefundedAt();
        this.taxInvoiceIssued = l.isTaxInvoiceIssued();
        this.taxInvoiceIssuedAt = l.getTaxInvoiceIssuedAt();
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
