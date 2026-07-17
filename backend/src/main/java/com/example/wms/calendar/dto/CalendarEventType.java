package com.example.wms.calendar.dto;

/** 캘린더 이벤트 유형. */
public enum CalendarEventType {
    INBOUND,   // 입고 예정/완료 (계약 입고일)
    OUTBOUND,  // 출고 예정/완료 (계약 출고 예정일/실제 출고일)
    BILLING    // 보관료 청구/납기 (청구 원장 납기일)
}
