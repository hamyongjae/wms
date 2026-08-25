package com.example.wms.calendar.dto;

import com.example.wms.yard.entity.ContainerLocationHistory;
import com.example.wms.yard.entity.LocationEventType;
import lombok.Getter;

import java.time.LocalDateTime;

/** [위치 이력 1건] 계약 하나가 거쳐간 자리 — 입고/이동/출고/복구 시점의 창고·자리 스냅샷. */
@Getter
public class LocationHistoryEntry {

    private final LocationEventType eventType;
    private final String warehouseName;
    private final String locationLabel;
    private final LocalDateTime occurredAt;

    public LocationHistoryEntry(ContainerLocationHistory h) {
        this.eventType = h.getEventType();
        this.warehouseName = h.getWarehouseName();
        this.locationLabel = h.getLocationLabel();
        this.occurredAt = h.getOccurredAt();
    }
}
