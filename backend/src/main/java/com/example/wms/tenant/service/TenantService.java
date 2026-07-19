package com.example.wms.tenant.service;

import com.example.wms.security.SecurityUtils;
import com.example.wms.tenant.dto.TenantResponse;
import com.example.wms.tenant.dto.TenantUpdateRequest;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.tenant.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantRepository tenantRepository;

    // 내 회사 조회 (토큰의 tenantId 기준)
    @Transactional(readOnly = true)
    public TenantResponse getMyTenant() {
        return new TenantResponse(findMyTenant());
    }

    // 내 회사 정보 수정 (사업자번호는 변경 불가 — 엔티티 updateInfo가 처리)
    @Transactional
    public TenantResponse updateMyTenant(TenantUpdateRequest request) {
        Tenant tenant = findMyTenant();
        tenant.updateInfo(
                request.getName(),
                request.getCeoName(),
                request.getPhone(),
                request.getEmail(),
                request.getAddress()
        );
        tenant.changeDefaultStoragePeriodDays(request.getDefaultStoragePeriodDays());
        return new TenantResponse(tenant);
    }

    // [격리] 항상 로그인한 사용자의 tenant만 조회
    private Tenant findMyTenant() {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 업체입니다. id=" + tenantId));
    }
}
