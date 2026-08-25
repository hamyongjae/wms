package com.example.wms.calendar.service;

import com.example.wms.calendar.dto.CalendarEventResponse;
import com.example.wms.calendar.dto.CalendarEventStatus;
import com.example.wms.calendar.dto.CalendarEventType;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.security.SecurityUtils;
import com.example.wms.yard.entity.ContainerLocationHistory;
import com.example.wms.yard.entity.LocationEventType;
import com.example.wms.yard.entity.YardSlot;
import com.example.wms.yard.repository.ContainerLocationHistoryRepository;
import com.example.wms.yard.repository.YardSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

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
    private final YardSlotRepository yardSlotRepository;
    private final ContainerLocationHistoryRepository locationHistoryRepository;

    @Transactional(readOnly = true)
    public List<CalendarEventResponse> getEvents(LocalDate from, LocalDate to) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        LocalDate today = LocalDate.now();
        List<CalendarEventResponse> events = new ArrayList<>();

        List<StorageOrder> orders = orderRepository.findAllByTenantId(tenantId);

        // [위치 일괄 조회] 계약별로 슬롯을 하나씩 조회하면 N+1이 되므로, 이 화면에 보일 계약들의
        //   현재 적재 위치를 한 번에 가져와 orderId → 위치라벨[] 맵으로 만들어둔다.
        List<Long> orderIds = orders.stream().map(StorageOrder::getId).collect(Collectors.toList());
        Map<Long, List<String>> locationsByOrderId = new HashMap<>();
        if (!orderIds.isEmpty()) {
            for (YardSlot slot : yardSlotRepository.findOccupiedByCurrentOrderIds(tenantId, orderIds)) {
                Long orderId = slot.getContainer().getCurrentOrder().getId();
                locationsByOrderId.computeIfAbsent(orderId, k -> new ArrayList<>()).add(slot.getLocationLabel());
            }
        }

        // [출고 위치 이력] 출고 완료 건은 슬롯이 이미 비워져 '현재 점유' 조회로는 위치를 알 수 없다 —
        //   계약이 거쳐간 입고→이동→출고 이력 중 가장 최근 출고 기록을 '출고 시점 위치'로 대신 쓴다
        //   (컨테이너 재사용 여부와 무관하게 영구 보존되므로 releasedSlotId 단일 필드보다 신뢰할 수 있다).
        Map<Long, List<ContainerLocationHistory>> historyByOrderId = new HashMap<>();
        if (!orderIds.isEmpty()) {
            for (ContainerLocationHistory h : locationHistoryRepository.findByTenantIdAndOrderIdIn(tenantId, orderIds)) {
                historyByOrderId.computeIfAbsent(h.getOrder().getId(), k -> new ArrayList<>()).add(h);
            }
            for (List<ContainerLocationHistory> list : historyByOrderId.values()) {
                list.sort(Comparator.comparing(ContainerLocationHistory::getOccurredAt));
            }
        }

        // ===== 계약 → 입고/출고 (일정의 단일 소스) =====
        for (StorageOrder order : orders) {
            String customer = order.getCustomer().getName();
            String warehouseName = order.getWarehouse().getName();
            List<String> locs = locationsByOrderId.get(order.getId());
            String location = (locs == null || locs.isEmpty()) ? null : String.join(", ", locs);

            List<ContainerLocationHistory> rawHistory = historyByOrderId.getOrDefault(order.getId(), List.of());
            String lastOutboundLocation = rawHistory.stream()
                    .filter(h -> h.getEventType() == LocationEventType.OUTBOUND)
                    .reduce((first, second) -> second)
                    .map(ContainerLocationHistory::getLocationLabel)
                    .orElse(null);

            java.math.BigDecimal fee = order.getMonthlyFee() != null
                    ? java.math.BigDecimal.valueOf(order.getMonthlyFee()) : null;
            LocalDate periodStart = order.getStorageStartDate();
            LocalDate periodEnd = order.getActualEndDate() != null
                    ? order.getActualEndDate() : order.getExpectedEndDate();

            // 입고 이벤트 — 출고일 미정(장기 보관) 계약은 예정/완료 대신 전용 상태로 구분한다.
            LocalDate inDate = order.getStorageStartDate();
            if (inDate != null && inRange(inDate, from, to)) {
                CalendarEventStatus status;
                if (!order.isOutbound() && order.getExpectedEndDate() == null) {
                    status = CalendarEventStatus.INDEFINITE;
                } else {
                    status = inDate.isAfter(today) ? CalendarEventStatus.PENDING : CalendarEventStatus.COMPLETED;
                }
                events.add(event(order.getId(), "[" + customer + "] 입고", inDate,
                        CalendarEventType.INBOUND, status, customer, null, periodStart, periodEnd, fee,
                        warehouseName, location));
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
                // 이미 출고된 건은 지금 어디 있는지(현재 점유)가 아니라 어디서 나갔는지(출고 시점
                // 위치)가 궁금한 정보다 — 출고 예정(아직 안 나감)은 현재 점유 위치를 그대로 쓴다.
                String outLocation = released ? lastOutboundLocation : location;
                events.add(event(order.getId(), "[" + customer + "] 출고", outDate,
                        CalendarEventType.OUTBOUND, status, customer, null, periodStart, periodEnd, fee,
                        warehouseName, outLocation));
            }
        }

        // [정책] 입출고 일정은 입고/출고만 노출한다. (청구/납기 이벤트는 청구·정산 화면에서 관리)
        return events;
    }

    private CalendarEventResponse event(Long id, String title, LocalDate date,
                                        CalendarEventType type, CalendarEventStatus status,
                                        String customer, java.math.BigDecimal amount,
                                        LocalDate startDate, LocalDate endDate, java.math.BigDecimal unitPrice,
                                        String warehouseName, String location) {
        return new CalendarEventResponse(id, title,
                date.atTime(EVENT_TIME), date.atTime(EVENT_TIME),
                type, status, customer, amount, startDate, endDate, unitPrice,
                warehouseName, location);
    }

    private boolean inRange(LocalDate d, LocalDate from, LocalDate to) {
        return !d.isBefore(from) && !d.isAfter(to);
    }
}
