package com.example.wms.calendar.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.calendar.dto.CalendarEventResponse;
import com.example.wms.calendar.dto.CalendarEventStatus;
import com.example.wms.calendar.dto.CalendarEventType;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 입고/출고/청구를 하나의 캘린더 이벤트 시계열로 정규화하는 서비스.
 *
 * [격리] 모든 조회는 현재 tenantId 범위로 강제된다.
 * [파생 규칙]
 *  - INBOUND  : 계약 입고일(storageStartDate). 오늘 지났으면 완료, 아니면 예정.
 *  - OUTBOUND : 출고 완료면 실제 출고일 + 완료, 아니면 출고 예정일 기준(경과 시 지연).
 *  - BILLING  : 청구 원장 납기일. 완납=완료, 잔액 있고 납기 경과=연체, 그 외 예정.
 */
@Service
@RequiredArgsConstructor
public class CalendarService {

    private static final LocalTime EVENT_TIME = LocalTime.of(9, 0);

    private final StorageOrderRepository orderRepository;
    private final BillingLedgerRepository ledgerRepository;

    @Transactional(readOnly = true)
    public List<CalendarEventResponse> getEvents(LocalDate from, LocalDate to) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        LocalDate today = LocalDate.now();
        List<CalendarEventResponse> events = new ArrayList<>();

        // ===== 계약 → 입고/출고 =====
        for (StorageOrder order : orderRepository.findAllByTenantId(tenantId)) {
            if (order.getStatus() == OrderStatus.CANCELLED) {
                continue;
            }
            String customer = order.getCustomer().getName();

            // 입고 이벤트
            LocalDate inDate = order.getStorageStartDate();
            if (inDate != null && inRange(inDate, from, to)) {
                CalendarEventStatus status =
                        inDate.isAfter(today) ? CalendarEventStatus.PENDING : CalendarEventStatus.COMPLETED;
                events.add(event(order.getId(), "[" + customer + "] 입고", inDate,
                        CalendarEventType.INBOUND, status, customer, null));
            }

            // 출고 이벤트 (완료면 실제일, 아니면 예정일)
            boolean released = order.getActualEndDate() != null;
            LocalDate outDate = released ? order.getActualEndDate() : order.getExpectedEndDate();
            if (outDate != null && inRange(outDate, from, to)) {
                CalendarEventStatus status;
                if (released) {
                    status = CalendarEventStatus.COMPLETED;
                } else if (outDate.isBefore(today)) {
                    status = CalendarEventStatus.OVERDUE;
                } else {
                    status = CalendarEventStatus.PENDING;
                }
                events.add(event(order.getId(), "[" + customer + "] 출고", outDate,
                        CalendarEventType.OUTBOUND, status, customer, null));
            }
        }

        // ===== 청구 원장 → 청구/납기 =====
        for (BillingLedger ledger : ledgerRepository.findAllByTenantId(tenantId)) {
            if (ledger.getStatus() == BillingStatus.CANCELED) {
                continue;
            }
            LocalDate due = ledger.getDueDate();
            if (due == null || !inRange(due, from, to)) {
                continue;
            }
            String customer = ledger.getCustomer().getName();

            boolean overdue = ledger.getBalance().signum() > 0
                    && (ledger.getStatus() == BillingStatus.ISSUED
                        || ledger.getStatus() == BillingStatus.PARTIALLY_PAID)
                    && due.isBefore(today);

            CalendarEventStatus status;
            if (ledger.getStatus() == BillingStatus.PAID) {
                status = CalendarEventStatus.COMPLETED;
            } else if (overdue) {
                status = CalendarEventStatus.OVERDUE;
            } else {
                status = CalendarEventStatus.PENDING;
            }

            events.add(new CalendarEventResponse(
                    ledger.getId(), "[" + customer + "] 청구",
                    due.atTime(EVENT_TIME), due.atTime(EVENT_TIME),
                    CalendarEventType.BILLING, status, customer, ledger.getBalance()));
        }

        return events;
    }

    private CalendarEventResponse event(Long id, String title, LocalDate date,
                                        CalendarEventType type, CalendarEventStatus status,
                                        String customer, java.math.BigDecimal amount) {
        return new CalendarEventResponse(id, title,
                date.atTime(EVENT_TIME), date.atTime(EVENT_TIME),
                type, status, customer, amount);
    }

    private boolean inRange(LocalDate d, LocalDate from, LocalDate to) {
        return !d.isBefore(from) && !d.isAfter(to);
    }
}
