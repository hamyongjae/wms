package com.example.wms.calendar.controller;

import com.example.wms.calendar.dto.CalendarEventResponse;
import com.example.wms.calendar.service.CalendarService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 캘린더 시계열 이벤트 API (조회 전용, 인증된 사용자 모두 허용).
 *
 * 예) GET /api/calendar/events?from=2026-07-01&to=2026-07-31
 * 응답: 해당 기간의 입고/출고/청구 이벤트를 하나의 목록으로.
 */
@RestController
@RequestMapping("/api/calendar")
@RequiredArgsConstructor
public class CalendarController {

    private final CalendarService calendarService;

    @GetMapping("/events")
    public ResponseEntity<List<CalendarEventResponse>> getEvents(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(calendarService.getEvents(from, to));
    }
}
