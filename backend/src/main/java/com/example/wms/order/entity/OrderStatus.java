package com.example.wms.order.entity;

public enum OrderStatus {
    RECEIVED,     // 입고 완료
    IN_STORAGE,   // 보관 중
    RELEASED,     // 출고 완료
    CANCELLED     // 취소
}