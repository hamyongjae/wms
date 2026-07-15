package com.example.wms.billing.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class MidReleaseRequest {

    @NotNull(message = "실제 출고일은 필수입니다")
    private LocalDate actualEndDate;
}
