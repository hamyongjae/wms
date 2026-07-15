package com.example.wms.customer.dto;

import com.example.wms.customer.entity.CustomerType;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CustomerUpdateRequest {

    @NotBlank(message = "고객명은 필수입니다")
    private String name;

    private CustomerType customerType;
    private String businessNumber;

    private String phoneNumber;
    private String email;
    private String emergencyContactName;
    private String emergencyContactPhone;

    private String originAddress;
    private String destinationAddress;
    private String postalCode;

    private String memo;
}