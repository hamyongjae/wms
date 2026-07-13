package com.example.wms.domain.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.wms.domain.dto.TenantCreateRequest;
import com.example.wms.domain.dto.TenantResponse;
import com.example.wms.domain.dto.TenantUpdateRequest;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.repository.TenantRepository;

import lombok.RequiredArgsConstructor;

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

    // 전체 조회 + 이름 검색 (페이징)
    @Transactional(readOnly = true)
    public Page<TenantResponse> getAllTenants(String name, Pageable pageable) {

        Page<Tenant> tenants;

        if (name == null || name.isBlank()) {
            // 검색어가 없으면 전체 조회
            tenants = tenantRepository.findAll(pageable);
        } else {
            // 검색어가 있으면 이름으로 검색
            tenants = tenantRepository.findByNameContaining(name, pageable);
        }

        return tenants.map(TenantResponse::new);
    }

    // id로 특정 창고업체 조회
    @Transactional(readOnly = true)
    public TenantResponse getTenant(Long id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 업체입니다. id=" + id));

        return new TenantResponse(tenant);
    }

    // 업체 정보 수정
    @Transactional
    public TenantResponse updateTenant(Long id, TenantUpdateRequest request) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 업체입니다. id=" + id));

        tenant.updateInfo(
                request.getName(),
                request.getCeoName(),
                request.getPhone(),
                request.getEmail(),
                request.getAddress()
        );

        return new TenantResponse(tenant);
    }

    // 업체 삭제
    @Transactional
    public void deleteTenant(Long id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 업체입니다. id=" + id));

        tenantRepository.delete(tenant);
    }
}