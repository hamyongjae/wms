package com.example.wms.tenant.dto;

import com.example.wms.tenant.entity.Tenant;
import lombok.Getter;

@Getter
public class TenantResponse {

    private final Long id;
    private final String name;
    private final String businessNumber;
    private final String ceoName;
    private final String phone;
    private final String email;
    private final String address;
    private final String status;

    // Entity를 받아서 DTO로 변환하는 생성자
    public TenantResponse(Tenant tenant) {
        this.id = tenant.getId();
        this.name =