package com.example.wms.domain.service;

import com.example.wms.domain.dto.TenantCreateRequest;
import com.example.wms.domain.dto.TenantResponse;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantRepository tenantRepository;

    // 창고업체 등록
    @Transactional
    public TenantResponse createTenant(TenantCreateRequest request) {

        // 규칙 1: 사업자번호 중복 검사
        if (tenantRepository.existsByBusinessNumber(request.getBusinessNumber())) {
            throw new IllegalArgumentException("이미 등록된 사업자번호입니다: " + request.getBusinessNumber());
        }

        // DTO → Entity 변환
        Tenant tenant = new Tenant(
                request.getName(),
                request.getBusinessNumber(),
                request.getCeoName(),
                request.getPhone(),
                request.getEmail(),
                request.getAddress()
        );

        // DB에 저장
        Tenant saved = tenantRepository.save(tenant);

        // Entity → 응답 DTO 변환 후 반환
        return new TenantResponse(saved);
    }
}