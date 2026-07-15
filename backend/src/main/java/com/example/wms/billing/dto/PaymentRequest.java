package com.example.wms.billing.dto;

import com.example.wms.billing.entity.PaymentMethod;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Getter
@NoArgsConstructor
public class PaymentRequest {

    @NotNull(message = "수금액은 필수입니다")
    @DecimalMin(value = "0.01", message = "수금액은 0보다 커야 합니다")
    private BigDecimal amount;

    @NotNull(message = "수금 수단은 필수입니다")
    private PaymentMethod method;

    @NotNull(message = "입금일은 필수입니다")
    private LocalDate paidOn;

    private String memo;
}
