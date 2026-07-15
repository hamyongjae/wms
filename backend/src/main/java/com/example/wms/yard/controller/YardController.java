package com.example.wms.yard.controller;

import com.example.wms.yard.dto.*;
import com.example.wms.yard.entity.StorageTerm;
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
 * 야적장(Yard) 관리 API.
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
