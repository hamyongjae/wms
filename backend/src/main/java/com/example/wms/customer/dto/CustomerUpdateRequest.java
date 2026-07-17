package com.example.wms.customer.dto;

import com.example.wms.customer.entity.CustomerType;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 고객 정보 수정 요청 (슬림). */
@Getter
@NoArgsConstructor
public class CustomerUpdateRequest {

    @NotBlank(message = "고객명은 필수입니다")
    private String name;

    private CustomerType customerType;
    private String businessNumber;
    private String phoneNumber;
    private String email;
    private String memo;
}
