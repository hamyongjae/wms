package com.example.wms.yard.service;

import com.example.wms.security.SecurityUtils;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.warehouse.repository.WarehouseRepository;
import com.example.wms.yard.dto.FloorPriceResponse;
import com.example.wms.yard.dto.FloorPriceUpsertRequest;
import com.example.wms.yard.entity.FloorPrice;
import com.example.wms.yard.repository.FloorPriceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * [층별 보관 단가] 조회·설정 서비스.
 *
 * 층 단위 단일 행만 조회/갱신하므로, 슬롯 144개를 루프 도는 대량 UPDATE가 전혀 없다.
 */
@Service
@RequiredArgsConstructor
public class FloorPriceService {

    private final FloorPriceRepository floorPriceRepository;
    private final WarehouseRepository warehouseRepository;

    /** 창고의 층별 단가 목록 (단일 조건절 1회 조회) */
    @Transactional(readOnly = true)
    public List<FloorPriceResponse> getFloorPrices(Long warehouseId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return floorPriceRepository.findByTenantIdAndWarehouseId(tenantId, warehouseId).stream()
                .map(FloorPriceResponse::new)
                .toList();
    }

    /** 특정 층 단가 설정(upsert) — 슬롯을 건드리지 않고 층 메타 1행만 갱신/생성 */
    @Transactional
    public FloorPriceResponse setFloorPrice(FloorPriceUpsertRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(req.getWarehouseId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 창고입니다. id=" + req.getWarehouseId()));

        FloorPrice fp = floorPriceRepository
                .findByTenantIdAndWarehouseIdAndTier(tenantId, req.getWarehouseId(), req.getTier())
                .orElseGet(() -> new FloorPrice(warehouse.getTenant(), warehouse, req.getTier(), req.getUnitPrice()));
        fp.changePrice(req.getUnitPrice());
        return new FloorPriceResponse(floorPriceRepository.save(fp));
    }
}
