package com.example.wms.calendar.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.calendar.dto.CalendarEventResponse;
import com.example.wms.calendar.dto.CalendarEventStatus;
import com.example.wms.calendar.dto.CalendarEventType;
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
 * [단일 소스] 입고/출고 일정은 오직 '계약(StorageOrder)'에서만 파생한다.
 *   컨테이너는 계약에 종속된 물리 단위일 뿐, 컨테이너 자체 날짜로 별도 이벤트를 만들지 않는다.
 *   → 캘린더가 '계약 관리' 화면의 보관기간과 항상 1:1로 일치한다(어긋남·중복 원천 차단).
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

        // ===== 계약 → 입고/출고 (일정의 단일 소스) =====
        for (StorageOrder order : orderRepository.findAllByTenantId(tenantId)) {
            String customer = order.getCustomer().getName();

            java.math.BigDecimal fee = order.getMonthlyFee() != null
                    ? java.math.BigDecimal.valueOf(order.getMonthlyFee()) : null;
            LocalDate periodStart = order.getStorageStartDate();
            LocalDate periodEnd = order.getActualEndDate() != null
                    ? order.getActualEndDate() : order.getExpectedEndDate();

            // 입고 이벤트
            LocalDate inDate = order.getStorageStartDate();
            if (inDate != null && inRange(inDate, from, to)) {
                CalendarEventStatus status =
                        inDate.isAfter(today) ? CalendarEventStatus.PENDING : CalendarEventStatus.COMPLETED;
                events.add(event(order.getId(), "[" + customer + "] 입고", inDate,
                        CalendarEventType.INBOUND, status, customer, null, periodStart, periodEnd, fee));
            }

            // 출고 이벤트 — [단일 이진 상태] 계약의 status(OUTBOUND) 를 유일 기준으로 삼는다.
            //   actualEndDate 유무가 아니라 status 로 판정 → 계약관리 토글과 100% 일치.
            boolean released = order.isOutbound();
            LocalDate outDate = released
                    ? (order.getActualEndDate() != null ? order.getActualEndDate() : order.getExpectedEndDate())
                    : order.getExpectedEndDate();
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
                        CalendarEventType.OUTBOUND, status, customer, null, periodStart, periodEnd, fee));
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
                    CalendarEventType.BILLING, status, customer, ledger.getBalance(),
                    ledger.getBillingPeriodStart(), ledger.getBillingPeriodEnd(), ledger.getBaseAmount()));
        }

        return events;
    }

    private CalendarEventResponse event(Long id, String title, LocalDate date,
                                        CalendarEventType type, CalendarEventStatus status,
                                        String customer, java.math.BigDecimal amount,
                                        LocalDate startDate, LocalDate endDate, java.math.BigDecimal unitPrice) {
        return new CalendarEventResponse(id, title,
                date.atTime(EVENT_TIME), date.atTime(EVENT_TIME),
                type, status, customer, amount, startDate, endDate, unitPrice);
    }

    private boolean inRange(LocalDate d, LocalDate from, LocalDate to) {
        return !d.isBefore(from) && !d.isAfter(to);
    }
}
