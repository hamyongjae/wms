package com.example.wms.domain.controller;

import com.example.wms.domain.dto.*;
import com.example.wms.domain.service.StorageOrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

    @GetMapping
    public ResponseEntity<Page<StorageOrderResponse>> getOrders(
            @RequestParam Long tenantId,
            Pageable pageable) {
        return ResponseEntity.ok(storageOrderService.getOrdersByTenant(tenantId, pageable));
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

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOrder(@PathVariable Long id) {
        storageOrderService.deleteOrder(id);
        return ResponseEntity.noContent().build();
    }
}