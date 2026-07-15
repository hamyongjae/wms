package com.example.wms.warehouse.controller;

import com.example.wms.warehouse.dto.WarehouseCreateRequest;
import com.example.wms.warehouse.dto.WarehouseResponse;
import com.example.wms.warehouse.dto.WarehouseUpdateRequest;
import com.example.wms.warehouse.service.WarehouseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses")
@RequiredArgsConstructor
public class WarehouseController {

    private final WarehouseService warehouseService;

    // 창고 등록 (POST /api/warehouses) — ADMIN만 (창고 관리)
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<WarehouseResponse> createWarehouse(
            @Valid @RequestBody WarehouseCreateRequest request) {

        WarehouseResponse response = warehouseService.createWarehouse(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 내 업체의 창고 목록 (GET /api/warehouses)
    // tenantId는 토큰에서 자동 결정
    @GetMapping
    public ResponseEntity<List<WarehouseResponse>> getWarehouses() {
        List<WarehouseResponse> responses = warehouseService.getWarehouses();
        return ResponseEntity.ok(responses);
    }

    // 창고 수정 (PUT /api/warehouses/1) — ADMIN만
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<WarehouseResponse> updateWarehouse(
            @PathVariable Long id,
            @Valid @RequestBody WarehouseUpdateRequest request) {

        WarehouseResponse response = warehouseService.updateWarehouse(id, request);
        return ResponseEntity.ok(response);
    }

    // 창고 삭제 (DELETE /api/warehouses/1) — ADMIN만
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteWarehouse(@PathVariable Long id) {
        warehouseService.deleteWarehouse(id);
        return ResponseEntity.noContent().build();
    }
}