package com.example.wms.container.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class ContainerAssignRequest {

    @NotNull(message = "배정할 계약(orderId)은 필수입니다")
    private Long orderId;
}
