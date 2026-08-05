package com.example.wms.order.dto;

import com.example.wms.order.entity.StorageOrder;
import lombok.Getter;

import java.time.LocalDate;

@Getter
public class StorageOrderResponse {

    private final Long id;

    private final Long tenantId;
    private final String tenantName;
    private final Long customerId;
    private final String customerName;
    private final Long warehouseId;
    private final String warehouseName;

    private final String status;
    private final LocalDate storageStartDate;
    private final LocalDate expectedEndDate;
    private final LocalDate actualEndDate;
    private final Integer monthlyFee;
    private final Double capacityTons;
    private final String memo;

    // 청구 조건 (선불/후불 · 납기일)
    private final String paymentType;
    private final LocalDate dueDate;

    // 결제 수단 & 수납 계좌(담당 직원 계좌 스냅샷)
    private final String paymentMethod;
    private final Long settlementUserId;
    private final String settlementUserName;
    private final String bankName;
    private final String accountNumber;
    private final String accountHolder;

    // 정산서 생성 방식 — true: 매월 자동 생성, false: 수동 생성
    private final Boolean autoBillingEnabled;
    // 정산서 자동 생성 주기(개월) — autoBillingEnabled가 true일 때만 의미 있음
    private final Integer billingCycleMonths;

    public StorageOrderResponse(StorageOrder order) {
        this.id = order.getId();

        this.tenantId = order.getTenant().getId();
        this.tenantName = order.getTenant().getName();
        this.customerId = order.getCustomer().getId();
        this.customerName = order.getCustomer().getName();
        this.warehouseId = order.getWarehouse().getId();
        this.warehouseName = order.getWarehouse().getName();

        this.status = order.getStatus().name();
        this.storageStartDate = order.getStorageStartDate();
        this.expectedEndDate = order.getExpectedEndDate();
        this.actualEndDate = order.getActualEndDate();
        this.monthlyFee = order.getMonthlyFee();
        this.capacityTons = order.getCapacityTons();
        this.memo = order.getMemo();

        this.paymentType = order.getPaymentType() != null ? order.getPaymentType().name() : null;
        this.dueDate = order.getDueDate();

        this.paymentMethod = order.getPaymentMethod() != null ? order.getPaymentMethod().name() : null;
        var su = order.getSettlementUser();
        this.settlementUserId = su != null ? su.getId() : null;
        this.settlementUserName = su != null ? su.getName() : null;
        this.bankName = su != null ? su.getBankName() : null;
        this.accountNumber = su != null ? su.getAccountNumber() : null;
        this.accountHolder = su != null ? su.getAccountHolder() : null;

        this.autoBillingEnabled = order.getAutoBillingEnabled();
        this.billingCycleMonths = order.getBillingCycleMonths();
    }
}