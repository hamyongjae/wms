package com.example.wms.customer.dto;

import com.example.wms.customer.entity.Customer;
import lombok.Getter;

import java.time.LocalDateTime;

/** 고객 응답 (슬림 + 블랙리스트 메타). */
@Getter
public class CustomerResponse {

    private final Long id;
    private final Long tenantId;
    private final String tenantName;

    private final String name;
    private final String customerType;
    private final String businessNumber;

    private final String phoneNumber;
    private final String email;

    private final String status;
    private final String blacklistReason;      // BLACKLISTED일 때만 값
    private final LocalDateTime blacklistedAt;  // 지정 일자
    private final String memo;

    public CustomerResponse(Customer customer) {
        this.id = customer.getId();
        this.tenantId = customer.getTenant().getId();
        this.tenantName = customer.getTenant().getName();

        this.name = customer.getName();
        this.customerType = customer.getCustomerType().name();
        this.businessNumber = customer.getBusinessNumber();

        this.phoneNumber = customer.getPhoneNumber();
        this.email = customer.getEmail();

        this.status = customer.getStatus().name();
        this.blacklistReason = customer.getBlacklistReason();
        this.blacklistedAt = customer.getBlacklistedAt();
        this.memo = customer.getMemo();
    }
}
