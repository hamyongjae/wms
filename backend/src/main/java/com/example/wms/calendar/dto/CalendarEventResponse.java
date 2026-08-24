package com.example.wms.calendar.dto;

import lombok.Getter;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 프론트 캘린더가 소비하는 단일 이벤트 규격.
 * 입고/출고/청구를 하나의 시계열 이벤트로 정규화해 반환한다.
 */
@Getter
public class CalendarEventResponse {

    private final Long id;                  // 원본 엔티티 id (주문 id 또는 원장 id)
    private final String title;             // 예: "[홍길동] 입고"
    private final LocalDateTime startAt;
    private final LocalDateTime endAt;
    private final CalendarEventType type;
    private final CalendarEventStatus status;
    private final String customerName;
    private final BigDecimal amount;        // BILLING 일 때만 값(미수 잔액), 그 외 null

    // 상세 표시용: 시작일/종료일/단가 (소스에 있으면 채워짐, 없으면 null)
    private final LocalDate startDate;
    private final LocalDate endDate;
    private final BigDecimal unitPrice;

    // 상세 표시용: 창고명 / 실제 적재 위치(예: "1층-15", 복수 컨테이너면 콤마 구분). 위치 미배정이면 null.
    private final String warehouseName;
    private final String location;

    public CalendarEventResponse(Long id, String title, LocalDateTime startAt, LocalDateTime endAt,
                                 CalendarEventType type, CalendarEventStatus status,
                                 String customerName, BigDecimal amount,
                                 LocalDate startDate, LocalDate endDate, BigDecimal unitPrice,
                                 String warehouseName, String location) {
        this.id = id;
        this.title = title;
        this.startAt = startAt;
        this.endAt = endAt;
        this.type = type;
        this.status = status;
        this.customerName = customerName;
        this.amount = amount;
        this.startDate = startDate;
        this.endDate = endDate;
        this.unitPrice = unitPrice;
        this.warehouseName = warehouseName;
        this.location = location;
    }
}
