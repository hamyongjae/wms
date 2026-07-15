package com.example.wms.tenant.controller;

import com.example.wms.tenant.dto.TenantResponse;
import com.example.wms.tenant.dto.TenantUpdateRequest;
import com.example.wms.tenant.service.TenantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 업체(자기 회사) 관리 API.
 *
 * 회사 생성은 공개 온보딩(POST /api/auth/register-company)에서만 이뤄진다.
 * 여기서는 "로그인한 사용자의 자기 회사"만 조회/수정한다.
 * 전체 목록·타 업체 조회·삭제는 노출하지 않아 테넌트 간 격리를 지킨다.
 * (플랫폼 관리자(SUPER_ADMIN) 도입 시 전체 관리 API를 별도로 열 수 있음)
 */
@RestController
@RequestMapping("/api/tenants")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;

    // 내 회사 정보 조회 (GET /api/tenants/me)
    @GetMapping("/me")
    public ResponseEntity<TenantResponse> getMyTenant() {
        return ResponseEntity.ok(tenantService.getMyTenant());
    }

    // 내 회사 정보 수정 (PUT /api/tenants/me) — ADMIN만
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/me")
    public ResponseEntity<TenantResponse> updateMyTenant(
            @Valid @RequestBody TenantUpdateRequest request) {
        return ResponseEntity.ok(tenantService.updateMyTenant(request));
    }
}
