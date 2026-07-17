package com.example.wms.customer.entity;

public enum CustomerStatus {
    ACTIVE,       // 정상 거래 중
    DORMANT,      // 장기 미거래 휴면 고객
    BLACKLISTED   // 상습 체납·분쟁 등으로 거래 정지된 블랙리스트 고객
}
