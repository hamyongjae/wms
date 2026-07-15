package com.example.wms.yard.repository;

/** 창고별 점유 집계 프로젝션 */
public interface WarehouseOccupancyView {
    Long getWarehouseId();
    String getWarehouseName();
    long getTotal();
    long getOccupied();
}
