package com.example.wms.yard.dto;

import lombok.Getter;

import java.util.List;

/** 창고별 점유 현황 (blocks는 단일 창고 상세일 때만 채워짐) */
@Getter
public class WarehouseOccupancyResponse {

    private final Long warehouseId;
    private final String warehouseName;
    private final long totalSlots;
    private final long occupiedSlots;
    private final long availableSlots;
    private final double occupancyRate;   // 사용률(%) — 소수점 1자리
    private final double vacancyRate;      // 공실률(%) — 소수점 1자리
    private final List<BlockOccupancyResponse> blocks;

    public WarehouseOccupancyResponse(Long warehouseId, String warehouseName,
                                      long total, long occupied,
                                      List<BlockOccupancyResponse> blocks) {
        this.warehouseId = warehouseId;
        this.warehouseName = warehouseName;
        this.totalSlots = total;
        this.occupiedSlots = occupied;
        this.availableSlots = total - occupied;
        this.occupancyRate = OccupancyRate.of(occupied, total);
        this.vacancyRate = OccupancyRate.of(total - occupied, total);
        this.blocks = blocks;
    }
}
