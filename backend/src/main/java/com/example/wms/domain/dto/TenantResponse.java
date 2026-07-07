package com.example.wms.domain.dto;

import com.example.wms.domain.entity.Tenant;
import lombok.Getter;

@Getter
public class TenantResponse {

    private final Long id;
    private final String name;
    private final String businessNumber;
    private final String status;

    // Entity를 받아서 DTO로 변환하는 생성자
    public TenantResponse(Tenant tenant) {
        this.id = tenant.getId();
        this.name = tenant.getName();
        this.businessNumber = tenant.getBusinessNumber();
        this.status = tenant.getStatus().name();
    }
}