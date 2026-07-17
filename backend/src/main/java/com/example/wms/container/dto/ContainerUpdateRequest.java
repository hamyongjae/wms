package com.example.wms.container.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class ContainerUpdateRequest {

    @NotBlank(message = "컨테이너 번호는 필수입니다")
    private String containerNo;

    @Positive(message = "용량은 0보다 커야 합니다")
    private Integer capacityTon;

    private String memo;

    private LocalDate inboundDate;            // 입고일
    private LocalDate expectedOutboundDate;   // 출고 예정일
}
