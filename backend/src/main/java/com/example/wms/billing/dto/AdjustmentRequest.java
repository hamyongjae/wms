package com.example.wms.billing.dto;

import com.example.wms.billing.entity.AdjustmentType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Getter
@NoArgsConstructor
public class AdjustmentRequest {

    @NotNull(message = "조정 유형은 필수입니다")
    private AdjustmentType type;

    // 금액(크기). DISCOUNT/WRITE_OFF는 서버가 음수로, SURCHARGE는 양수로 적용.
    // CORRECTION은 입력한 부호를 그대로 사용.
    @NotNull(message = "조정 금액은 필수입니다")
    private BigDecimal amount;

    @NotBlank(message = "조정 사유는 필수입니다(오딧 트레일)")
    private String reason;
}
