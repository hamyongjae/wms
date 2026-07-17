package com.example.wms.calendar.dto;

/** 캘린더 이벤트 진행 상태. */
public enum CalendarEventStatus {
    PENDING,    // 예정 (미도래/미처리)
    COMPLETED,  // 완료 (입고 완료/출고 완료/완납)
    OVERDUE     // 기한 경과 (출고 지연/연체 청구)
}
