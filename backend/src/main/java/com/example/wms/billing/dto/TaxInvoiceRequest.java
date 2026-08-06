package com.example.wms.billing.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
public class TaxInvoiceRequest {

    @NotNull(message = "issued는 필수입니다")
    private Boolean issued;
}
