package com.example.wms.yard.dto;

/** 비율(%) 계산 유틸 — 분모 0 방어 + 소수점 1자리 반올림 */
final class OccupancyRate {
    private OccupancyRate() {}

    static double of(long part, long total) {
        if (total <= 0) return 0.0;
        return Math.round(part * 1000.0 / total) / 10.0;
    }
}
