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

    // BLACKLISTED로 지정할 때 필수 (서비스/엔티티에서 검증)
    private String reason;
}