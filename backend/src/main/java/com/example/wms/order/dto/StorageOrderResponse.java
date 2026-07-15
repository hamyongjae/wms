package com.example.wms.order.dto;

import com.example.wms.order.entity.StorageOrder;
import lombok.Getter;

import java.time.LocalDate;

@Getter
public class StorageOrderResponse {

    private final Long id;
    private final String orderNumber;

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
    private final Double totalVolume;
    private final String memo;

    public StorageOrderResponse(StorageOrder order) {
        this.id = order.getId();
        this.orderNumber = order.getOrderNumber();

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
        this.totalVolume = order.getTotalVolume();
        this.memo = order.getMemo();
    }
}