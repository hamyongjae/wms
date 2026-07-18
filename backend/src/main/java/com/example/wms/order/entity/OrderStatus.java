package com.example.wms.order.entity;

/**
 * [단순 이진 상태]
 * 입고(INBOUND) / 출고(OUTBOUND) 두 가지로만 계약 흐름을 제어한다.
 *
 * - INBOUND: 창고에 물품이 들어와 보관 중인 상태 (신규 계약 기본값)
 * - OUTBOUND: 물품이 창고에서 빠져나가 계약이 종료된 상태
 */
public enum OrderStatus {
    INBOUND,    // 입고
    OUTBOUND    // 출고
}
