package com.example.wms.customer.dto;

import com.example.wms.customer.entity.Customer;
import lombok.Getter;

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
    private final String emergencyContactName;
    private final String emergencyContactPhone;

    private final String originAddress;
    private final String destinationAddress;
    private final String postalCode;

    private final String status;
    private final boolean contractAgreed;
    private final boolean disposalConsent;
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
        this.emergencyContactName = customer.getEmergencyContactName();
        this.emergencyContactPhone = customer.getEmergencyContactPhone();

        this.originAddress = customer.getOriginAddress();
        this.destinationAddress = customer.getDestinationAddress();
        this.postalCode = customer.getPostalCode();

        this.status = customer.getStatus().name();
        this.contractAgreed = customer.isContractAgreed();
        this.disposalConsent = customer.isDisposalConsent();
        this.memo = customer.getMemo();
    }
}