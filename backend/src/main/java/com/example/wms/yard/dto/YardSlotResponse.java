package com.example.wms.yard.dto;

import com.example.wms.yard.entity.YardSlot;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class YardSlotResponse {

    private final Long id;
    private final Long tenantId;
    private final Long warehouseId;
    private final String warehouseName;
    private final String block;
    private final Integer rowNo;
    private final Integer columnNo;
    private final Integer tier;
    private final String locationLabel;
    private final boolean occupied;
    private final Long containerId;
    private final String containerNo;
    private final Long version;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public YardSlotResponse(YardSlot s) {
        this.id = s.getId();
        this.tenantId = s.getTenant().getId();
        this.warehouseId = s.getWarehouse().getId();
        this.warehouseName = s.getWarehouse().getName();
        this.block = s.getBlock();
        this.rowNo = s.getRowNo();
        this.columnNo = s.getColumnNo();
        this.tier = s.getTier();
        this.locationLabel = s.getLocationLabel();
        this.occupied = s.isOccupied();
        this.containerId = s.getContainer() != null ? s.getContainer().getId() : null;
        this.containerNo = s.getContainer() != null ? s.getContainer().getContainerNo() : null;
        this.version = s.getVersion();
        this.createdAt = s.getCreatedAt();
        this.updatedAt = s.getUpdatedAt();
    }
}
