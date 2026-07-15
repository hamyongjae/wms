package com.example.wms.yard.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class OutboundRequest {

    @NotNull(message = "컨테이너(containerId)는 필수입니다")
    private Long containerId;

    private String memo;
}
