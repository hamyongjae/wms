package com.example.wms.domain.service;

import com.example.wms.domain.dto.WarehouseCreateRequest;
import com.example.wms.domain.dto.WarehouseResponse;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.entity.Warehouse;
import com.example.wms.domain.repository.TenantRepository;
import com.example.wms.domain.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WarehouseService {

    private final WarehouseRepository warehouseRepository;
    private final TenantRepository tenantRepository;   // 업체 확인용

    // 창고 등록
    @Transactional
    public WarehouseResponse createWarehouse(WarehouseCreateRequest request) {

        // 규칙: 존재하는 업체인지 먼저 확인
        Tenant tenant = tenantRepository.findById(request.getTenantId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. id=" + request.getTenantId()));

        // tenantId(숫자) → Tenant(객체)로 바꿔서 창고 생성
        Warehouse warehouse = new Warehouse(
                request.getName(),
                request.getAddress(),
                request.getPhone(),
                tenant
        );

        Warehouse saved = warehouseRepository.save(warehouse);
        return new WarehouseResponse(saved);
    }

    // 특정 업체의 창고 목록 조회
    @Transactional(readOnly = true)
    public List<WarehouseResponse> getWarehousesByTenant(Long tenantId) {
        return warehouseRepository.findByTenantId(tenantId)
                .stream()
                .map(WarehouseResponse::new)
                .toList();
    }
}