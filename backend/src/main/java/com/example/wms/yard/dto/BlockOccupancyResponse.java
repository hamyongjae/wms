package com.example.wms.yard.dto;

import lombok.Getter;

/** 블록별 점유 현황 */
@Getter
public class BlockOccupancyResponse {

    private final String block;
    private final long totalSlots;
    private final long occupiedSlots;
    private final long availableSlots;
    private final double occupancyRate;   // 공실이 아닌 사용률(%) — 소수점 1자리

    public BlockOccupancyResponse(String block, long total, long occupied) {
        this.block = block;
        this.totalSlots = total;
        this.occupiedSlots = occupied;
        this.availableSlots = total - occupied;
        this.occupancyRate = OccupancyRate.of(occupied, total);
    }
}
