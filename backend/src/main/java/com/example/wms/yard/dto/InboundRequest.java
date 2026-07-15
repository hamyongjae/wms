package com.example.wms.yard.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class InboundRequest {

    @NotNull(message = "컨테이너(containerId)는 필수입니다")
    private Long containerId;

    @NotNull(message = "대상 슬롯(targetSlotId)은 필수입니다")
    private Long targetSlotId;

    private String memo;
}
