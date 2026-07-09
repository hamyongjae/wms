package com.example.wms.domain.dto;

import com.example.wms.domain.entity.Warehouse;
import lombok.Getter;

@Getter
public class WarehouseResponse {

    private final Long id;
    private final String name;
    private final String address;
    private final String phone;
    private final Long tenantId;
    private final String tenantName;   // 소속 업체명도 같이

    public WarehouseResponse(Warehouse warehouse) {
        this.id = warehouse.getId();
        this.name = warehouse.getName();
        this.address = warehouse.getAddress();
        this.phone = warehouse.getPhone();
        this.tenantId = warehouse.getTenant().getId();
        this.tenantName = warehouse.getTenant().getName();
    }
}