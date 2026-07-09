package com.example.wms.domain.controller;

import com.example.wms.domain.dto.WarehouseCreateRequest;
import com.example.wms.domain.dto.WarehouseResponse;
import com.example.wms.domain.service.WarehouseService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/warehouses")
@RequiredArgsConstructor
public class WarehouseController {

    private final WarehouseService warehouseService;

    // 창고 등록 (POST /api/warehouses)
    @PostMapping
    public ResponseEntity<WarehouseResponse> createWarehouse(
            @Valid @RequestBody WarehouseCreateRequest request) {

        WarehouseResponse response = warehouseService.createWarehouse(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 특정 업체의 창고 목록 (GET /api/warehouses?tenantId=1)
    @GetMapping
    public ResponseEntity<List<WarehouseResponse>> getWarehousesByTenant(
            @RequestParam Long tenantId) {

        List<WarehouseResponse> responses = warehouseService.getWarehousesByTenant(tenantId);
        return ResponseEntity.ok(responses);
    }
}