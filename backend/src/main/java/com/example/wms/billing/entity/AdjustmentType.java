package com.example.wms.billing.entity;

public enum AdjustmentType {
    DISCOUNT,    // 할인 (단골/프로모션 등) — 금액 차감(음수)
    SURCHARGE,   // 가산 (연체료/추가비용 등) — 금액 증가(양수)
    WRITE_OFF,   // 대손 상각 (회수 불가 처리) — 잔액 차감(음수)
    CORRECTION   // 단순 정정 (오기입 수정) — 부호 무관
}
