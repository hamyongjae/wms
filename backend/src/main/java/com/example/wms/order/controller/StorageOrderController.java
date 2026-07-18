package com.example.wms.order.controller;

import com.example.wms.order.dto.*;
import com.example.wms.order.service.StorageOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class StorageOrderController {

    private final StorageOrderService storageOrderService;

    @PostMapping
    public ResponseEntity<StorageOrderResponse> createOrder(
            @Valid @RequestBody StorageOrderCreateRequest request) {
        StorageOrderResponse response = storageOrderService.createOrder(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 내 업체의 계약 목록 — tenantId는 토큰에서 자동 결정
    @GetMapping
    public ResponseEntity<Page<StorageOrderResponse>> getOrders(Pageable pageable) {
        return ResponseEntity.ok(storageOrderService.getOrders(pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<StorageOrderResponse> getOrder(@PathVariable Long id) {
        return ResponseEntity.ok(storageOrderService.getOrder(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<StorageOrderResponse> updateOrder(
            @PathVariable Long id,
            @Valid @RequestBody StorageOrderUpdateRequest request) {
        return ResponseEntity.ok(storageOrderService.updateOrder(id, request));
    }

    @PatchMapping("/{id}/release")
    public ResponseEntity<StorageOrderResponse> releaseOrder(
            @PathVariable Long id,
            @Valid @RequestBody StorageOrderReleaseRequest request) {
        return ResponseEntity.ok(storageOrderService.releaseOrder(id, request));
    }

    @PatchMapping("/{id}/unreleased")
    public ResponseEntity<StorageOrderResponse> unreleaseOrder(@PathVariable Long id) {
        return ResponseEntity.ok(storageOrderService.unreleaseOrder(id));
    }

    // [단일 토글] 입고 ↔ 출고 전환 — 현재 상태의 반대로 변경
    @PatchMapping("/{id}/toggle")
    public ResponseEntity<StorageOrderResponse> toggleStatus(@PathVariable Long id) {
        return ResponseEntity.ok(storageOrderService.toggleStatus(id));
    }

    // 계약 삭제 — ADMIN만 허용 (STAFF가 호출하면 403)
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOrder(@PathVariable Long id) {
        storageOrderService.deleteOrder(id);
        return ResponseEntity.noContent().build();
    }
}