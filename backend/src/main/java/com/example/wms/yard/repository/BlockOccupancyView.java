package com.example.wms.yard.repository;

/** 블록별 점유 집계 프로젝션 */
public interface BlockOccupancyView {
    String getBlock();
    long getTotal();
    long getOccupied();
}
