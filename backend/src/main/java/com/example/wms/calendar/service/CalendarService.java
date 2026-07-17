package com.example.wms.calendar.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.calendar.dto.CalendarEventResponse;
import com.example.wms.calendar.dto.CalendarEventStatus;
import com.example.wms.calendar.dto.CalendarEventType;
import com.example.wms.container.entity.Container;
import com.example.wms.container.entity.ContainerStatus;
import com.example.wms.container.repository.ContainerRepository;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    private static final Pattern OWNER_TAG = Pattern.compile("^\\[([^\\]]+)\\]");

    private final StorageOrderRepository orderRepository;
    private final BillingLedgerRepository ledgerRepository;
    private final ContainerRepository containerRepository;

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

        // ===== 컨테이너 → 입고/출고(예정) =====
        for (Container container : containerRepository.findAllByTenantId(tenantId)) {
            String owner = ownerFromMemo(container.getMemo(), container.getContainerNo());

            LocalDate cIn = container.getInboundDate();
            LocalDate cOut = container.getExpectedOutboundDate();

            if (cIn != null && inRange(cIn, from, to)) {
                CalendarEventStatus status =
                        cIn.isAfter(today) ? CalendarEventStatus.PENDING : CalendarEventStatus.COMPLETED;
                events.add(event(container.getId(), "[" + owner + "] 입고", cIn,
                        CalendarEventType.INBOUND, status, owner, null, cIn, cOut, null));
            }

            if (cOut != null && inRange(cOut, from, to)) {
                // 아직 적재 중인데 출고 예정일이 지났으면 지연
                boolean overdue = cOut.isBefore(today) && container.getStatus() == ContainerStatus.OCCUPIED;
                CalendarEventStatus status =
                        overdue ? CalendarEventStatus.OVERDUE : CalendarEventStatus.PENDING;
                events.add(event(container.getId(), "[" + owner + "] 출고", cOut,
                        CalendarEventType.OUTBOUND, status, owner, null, cIn, cOut, null));
            }
        }

        return events;
    }

    /** 컨테이너 memo 앞 [화주] 태그에서 화주명을 뽑되, 규격/소유구분 토큰은 제외. 없으면 fallback(번호). */
    private String ownerFromMemo(String memo, String fallback) {
        if (memo != null) {
            Matcher m = OWNER_TAG.matcher(memo);
            if (m.find()) {
                List<String> keep = new ArrayList<>();
                for (String token : m.group(1).split("·")) {
                    String t = token.trim();
                    if (t.isEmpty() || t.matches("(?i)\\d+ft") || t.equals("자가") || t.equals("임차")) {
                        continue;
                    }
                    keep.add(t);
                }
                if (!keep.isEmpty()) {
                    return String.join(" · ", keep);
                }
            }
        }
        return fallback;
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
