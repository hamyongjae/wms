package com.example.wms.container.dto;

import com.example.wms.container.entity.Container;
import com.example.wms.container.entity.ContainerStatus;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class ContainerResponse {

    private final Long id;
    private final Long tenantId;
    private final Long warehouseId;
    private final String warehouseName;
    private final String containerNo;
    private final Integer capacityTon;
    private final ContainerStatus status;
    private final Long currentOrderId;
    private final String currentOrderNumber;
    private final String memo;
    private final Long version;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public ContainerResponse(Container c) {
        this.id = c.getId();
        this.tenantId = c.getTenant().getId();
        this.warehouseId = c.getWarehouse().getId();
        this.warehouseName = c.getWarehouse().getName();
        this.containerNo = c.getContainerNo();
        this.capacityTon = c.getCapacityTon();
        this.status = c.getStatus();
        this.currentOrderId = c.getCurrentOrder() != null ? c.getCurrentOrder().getId() : null;
        this.currentOrderNumber = c.getCurrentOrder() != null ? c.getCurrentOrder().getOrderNumber() : null;
        this.memo = c.getMemo();
        this.version = c.getVersion();
        this.createdAt = c.getCreatedAt();
        this.updatedAt = c.getUpdatedAt();
    }
}
