package com.example.wms.yard.controller;

import com.example.wms.yard.dto.WarehouseOccupancyResponse;
import com.example.wms.yard.dto.YardSlotResponse;
import com.example.wms.yard.service.YardDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 야적장 공간·점유 현황 대시보드 API (조회 전용, 인증된 사용자 모두 허용).
 */
@RestController
@RequestMapping("/api/yard/occupancy")
@RequiredArgsConstructor
public class YardDashboardController {

    private final YardDashboardService dashboardService;

    // 테넌트 전체: 창고별 점유 요약
    @GetMapping
    public ResponseEntity<List<WarehouseOccupancyResponse>> tenantOccupancy() {
        return ResponseEntity.ok(dashboardService.getTenantOccupancy());
    }

    // 특정 창고 상세: 총계 + 블록별 분해 + 공실률
    @GetMapping("/{warehouseId}")
    public ResponseEntity<WarehouseOccupancyResponse> warehouseOccupancy(@PathVariable Long warehouseId) {
        return ResponseEntity.ok(dashboardService.getWarehouseOccupancy(warehouseId));
    }

    // 컨테이너 점유 현황: 점유(기본) 또는 공실 슬롯 목록
    // 예: GET /api/yard/occupancy/1/slots?occupied=true
    @GetMapping("/{warehouseId}/slots")
    public ResponseEntity<Page<YardSlotResponse>> slotsByOccupancy(
            @PathVariable Long warehouseId,
            @RequestParam(defaultValue = "true") boolean occupied,
            Pageable pageable) {
        return ResponseEntity.ok(dashboardService.listSlotsByOccupancy(warehouseId, occupied, pageable));
    }
}
