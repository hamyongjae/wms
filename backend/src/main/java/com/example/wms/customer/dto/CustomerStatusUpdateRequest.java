package com.example.wms.customer.dto;

import com.example.wms.customer.entity.CustomerStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class CustomerStatusUpdateRequest {

    @NotNull(message = "변경할 상태는 필수입니다")
    private CustomerStatus status;
