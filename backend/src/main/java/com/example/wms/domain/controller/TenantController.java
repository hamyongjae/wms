package com.example.wms.domain.controller;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.wms.domain.dto.TenantCreateRequest;
import com.example.wms.domain.dto.TenantResponse;
import com.example.wms.domain.dto.TenantUpdateRequest;
import com.example.wms.domain.service.TenantService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

@RestController
@RequestMapping("/api/tenants")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;

    // 창고업체 등록 (POST /api/tenants)
    @PostMapping
    public ResponseEntity<TenantResponse> createTenant(
            @Valid @RequestBody TenantCreateRequest request) {

        TenantResponse response = tenantService.createTenant(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // 전체 조회 + 이름 검색 (페이징)
    @GetMapping
    public ResponseEntity<Page<TenantResponse>> getAllTenants(
            @RequestParam(required = false) String name,
            Pageable pageable) {

        Page<TenantResponse> responses = tenantService.getAllTenants(name, pageable);
        return ResponseEntity.ok(responses);
    }

    // id로 특정 창고업체 조회 (GET /api/tenants/1)
    @GetMapping("/{id}")
    public ResponseEntity<TenantResponse> getTenant(@PathVariable Long id) {
        TenantResponse response = tenantService.getTenant(id);
        return ResponseEntity.ok(response);
    }

    // 업체 수정 (PUT /api/tenants/1)
    @PutMapping("/{id}")
    public ResponseEntity<TenantResponse> updateTenant(
            @PathVariable Long id,
            @Valid @RequestBody TenantUpdateRequest request) {

        TenantResponse response = tenantService.updateTenant(id, request);
        return ResponseEntity.ok(response);
    }

    // 업체 삭제 (DELETE /api/tenants/1)
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTenant(@PathVariable Long id) {
        tenantService.deleteTenant(id);
        return ResponseEntity.noContent().build();
    }
}