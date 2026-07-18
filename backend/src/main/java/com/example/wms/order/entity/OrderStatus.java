package com.example.wms.order.entity;

public enum OrderStatus {
    PENDING,            // 입고예정: 시작일 미도래 또는 슬롯 미지정
    IN_STORAGE,         // 보관중: 슬롯 지정됨 + 보관 기간 내
    PENDING_RELEASE,    // 출고예정: 보관 기간 만료 + 미출고
    RELEASED,           // 출고완료: 실제 출고 처리됨
    CANCELLED           // 취소
}