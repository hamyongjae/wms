package com.example.wms.yard.controller;

import com.example.wms.yard.dto.*;
import com.example.wms.yard.entity.StorageTerm;
import com.example.wms.yard.service.FloorPriceService;
import com.example.wms.yard.service.LocationRecommendationService;
import com.example.wms.yard.service.YardOperationService;
import com.example.wms.yard.service.YardQueryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * 보관창고(Yard) 관리 API.
 *
 * [권한] 슬롯 격자 설계(등록/생성)는 ADMIN. 입고/이동/반출·조회·추천은 현장(STAFF)도 허용.
 */
@RestController
@RequestMapping("/api/yard")
@RequiredArgsConstructor
public class YardController {

    private final YardOperationService yardOperationService;
    private final YardQueryService yardQueryService;
    private final LocationRecommendationService recommendationService;
    private final FloorPriceService floorPriceService;

    // ===== 슬롯(로케이션) 설계 — ADMIN =====

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/slots")
    public ResponseEntity<YardSlotResponse> createSlot(@Valid @RequestBody SlotCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(yardOperationService.createSlot(request));
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/slots/generate")
    public ResponseEntity<String> generateGrid(@Valid @RequestBody GridGenerateRequest request) {
        int created = yardOperationService.generateGrid(request);
        return ResponseEntity.status(HttpStatus.CREATED).body("생성된 슬롯: " + created + "개");
    }

    // [층별 생성] 층마다 자리 개수를 지정해 재생성 (빈 자리 정리 후 N층-번호로 생성)
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/slots/generate-floors")
    public ResponseEntity<String> generateFloors(@Valid @RequestBody FloorGridRequest request) {
        int created = yardOperationService.generateFloors(request);
        return ResponseEntity.status(HttpStatus.CREATED).body("생성된 자리: " + created + "개");
    }

    @GetMapping("/slots")
    public ResponseEntity<Page<YardSlotResponse>> listSlots(
            @RequestParam Long warehouseId, Pageable pageable) {
        return ResponseEntity.ok(yardQueryService.listSlots(warehouseId, pageable));
    }

    // ===== 빈자리 추천 =====

    // 예: GET /api/yard/recommend?warehouseId=1&term=SHORT_TERM
    @GetMapping("/recommend")
    public ResponseEntity<YardSlotResponse> recommend(
            @RequestParam Long warehouseId,
            @RequestParam StorageTerm term) {
        return ResponseEntity.ok(recommendationService.recommend(warehouseId, term));
    }

    // ===== 층별 보관 단가 =====

    // 창고 층별 단가 목록 — 예: GET /api/yard/floor-prices?warehouseId=1
    @GetMapping("/floor-prices")
    public ResponseEntity<java.util.List<FloorPriceResponse>> getFloorPrices(@RequestParam Long warehouseId) {
        return ResponseEntity.ok(floorPriceService.getFloorPrices(warehouseId));
    }

    // 층 단가 설정(upsert) — ADMIN
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/floor-prices")
    public ResponseEntity<FloorPriceResponse> setFloorPrice(@Valid @RequestBody FloorPriceUpsertRequest request) {
        return ResponseEntity.ok(floorPriceService.setFloorPrice(request));
    }

    // ===== 입고 / 이동 / 반출 — 현장(STAFF+) =====

    @PostMapping("/inbound")
    public ResponseEntity<YardSlotResponse> inbound(@Valid @RequestBody InboundRequest request) {
        return ResponseEntity.ok(yardOperationService.inbound(request));
    }

    @PostMapping("/move")
    public ResponseEntity<YardSlotResponse> move(@Valid @RequestBody MoveRequest request) {
        return ResponseEntity.ok(yardOperationService.move(request));
    }

    @PostMapping("/outbound")
    public ResponseEntity<YardSlotResponse> outbound(@Valid @RequestBody OutboundRequest request) {
        return ResponseEntity.ok(yardOperationService.outbound(request));
    }
}
