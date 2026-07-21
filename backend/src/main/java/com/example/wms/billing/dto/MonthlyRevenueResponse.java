package com.example.wms.billing.dto;

import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;

/**
 * 월별 청구·수금 집계 (차트용).
 *  · billed    : 확정 청구 총액 = 기본청구액 + 이월유입 + 조정합계 (중도출고 차감·환불 조정 반영)
 *  · collected : 실제 수금액 = 수금 누계 (환불 완료 시 차감분까지 반영)
 * 원장 필드를 DB에서 직접 GROUP BY 합산하므로 수납 원장과 1원 단위까지 일치한다.
 */
@Getter
@Setter
public class MonthlyRevenueResponse {

    private String yearMonth;   // yyyy-MM
    private String label;       // 예: "7월"
    private BigDecimal billed;
    private BigDecimal collected;

    public MonthlyRevenueResponse(String yearMonth, String label, BigDecimal billed, BigDecimal collected) {
        this.yearMonth = yearMonth;
        this.label = label;
        this.billed = billed;
        this.collected = collected;
    }
}
