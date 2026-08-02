package com.example.wms.billing.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class DueDateChangeRequest {

    @NotNull(message = "납기일은 필수입니다")
    private LocalDate dueDate;
}
