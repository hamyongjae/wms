package com.example.wms.yard.entity;

/** [위치 이력 종류] 입고(첫 적재)·이동(자리 변경)·출고(반출)·복구(출고 취소로 원자리 재적재). */
public enum LocationEventType {
    INBOUND,
    MOVE,
    OUTBOUND,
    RESTORE
}
