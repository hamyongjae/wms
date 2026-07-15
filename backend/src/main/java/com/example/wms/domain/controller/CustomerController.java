package com.example.wms.domain.controller;

import com.example.wms.domain.dto.*;
import com.example.wms.domain.service.CustomerService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerController {

    private final CustomerService customerService;

    // 고객 등록
    @PostMapping
    public ResponseEntity<CustomerResponse> createCustomer(
            @Valid @RequestBody CustomerCreateRequest request) {
        CustomerResponse response = customerService.createCustomer(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 내 업체의 고객 목록 + 검색 (GET /api/customers?name=홍)
    // tenantId는 토큰에서 자동 결정 — 클라이언트가 지정하지 않는다.
    @GetMapping
    public ResponseEntity<Page<CustomerResponse>> getCustomers(
            @RequestParam(required = false) String name,
            Pageable pageable) {
        Page<CustomerResponse> responses = customerService.getCustomers(name, pageable);
        return ResponseEntity.ok(responses);
    }

    // 고객 단건 조회
    @GetMapping("/{id}")
    public ResponseEntity<CustomerResponse> getCustomer(@PathVariable Long id) {
        return ResponseEntity.ok(customerService.getCustomer(id));
    }

    // 고객 정보 수정
    @PutMapping("/{id}")
    public ResponseEntity<CustomerResponse> updateCustomer(
            @PathVariable Long id,
            @Valid @RequestBody CustomerUpdateRequest request) {
        return ResponseEntity.ok(customerService.updateCustomer(id, request));
    }

    // 고객 상태 변경 (PATCH /api/customers/1/status)
    @PatchMapping("/{id}/status")
    public ResponseEntity<CustomerResponse> changeStatus(
            @PathVariable Long id,
            @Valid @RequestBody CustomerStatusUpdateRequest request) {
        return ResponseEntity.ok(customerService.changeStatus(id, request));
    }

    // 고객 삭제 — ADMIN만 허용 (STAFF가 호출하면 403)
    @PreAuthorize("hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCustomer(@PathVariable Long id) {
        customerService.deleteCustomer(id);
        return ResponseEntity.noContent().build();
    }
}