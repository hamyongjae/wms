package com.example.wms.billing.entity;

public enum BillingStatus {
    DRAFT,           // 작성 중 (미발행)
    ISSUED,          // 발행됨 (청구 확정, 미수금 존재)
    PARTIALLY_PAID,  // 부분 수금
    PAID,            // 완납
    CARRIED_OVER,    // 잔액을 차월로 이월함 (이 원장은 마감)
    CANCELED         // 취소
}
