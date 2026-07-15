package com.example.wms.yard.service;

import com.example.wms.security.SecurityUtils;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.warehouse.repository.WarehouseRepository;
import com.example.wms.yard.dto.BlockOccupancyResponse;
import com.example.wms.yard.dto.WarehouseOccupancyResponse;
import com.example.wms.yard.dto.YardSlotResponse;
import com.example.wms.yard.repository.YardSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 야적장 공간·점유 현황 대시보드.
 *
 * 총 슬롯 / 사용중 / 공실 / 사용률·공실률을 창고 단위·블록 단위로 집계하고,
 * 컨테이너가 실제로 어느 슬롯을 점유했는지 목록으로 보여준다.
 */
@Service
@RequiredArgsConstructor
public class YardDashboardService {

    private final YardSlotRepository yardSlotRepository;
    private final WarehouseRepository warehouseRepository;

    /** 테넌트 전체: 창고별 점유 요약 (블록 분해 없음) */
    @Transactional(readOnly = true)
    public List<WarehouseOccupancyResponse> getTenantOccupancy() {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return yardSlotRepository.aggregateByWarehouse(tenantId).stream()
                .map(v -> new WarehouseOccupancyResponse(
                        v.getWarehouseId(), v.getWarehouseName(),
                        v.getTotal(), v.getOccupied(), null))
                .toList();
    }

    /** 특정 창고 상세: 총계 + 블록별 분해 */
    @Transactional(readOnly = true)
    public WarehouseOccupancyResponse getWarehouseOccupancy(Long warehouseId) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(warehouseId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + warehouseId));

        long total = yardSlotRepository.countByTenantIdAndWarehouseId(tenantId, warehouseId);
        long occupied = yardSlotRepository.countByTenantIdAndWarehouseIdAndOccupied(tenantId, warehouseId, true);

        List<BlockOccupancyResponse> blocks = yardSlotRepository.aggregateByBlock(tenantId, warehouseId).stream()
                .map(v -> new BlockOccupancyResponse(v.getBlock(), v.getTotal(), v.getOccupied()))
                .toList();

        return new WarehouseOccupancyResponse(
                warehouse.getId(), warehouse.getName(), total, occupied, blocks);
    }

    /** 컨테이너 점유 현황: 점유(또는 공실) 슬롯 목록 */
    @Transactional(readOnly = true)
    public Page<YardSlotResponse> listSlotsByOccupancy(Long warehouseId, boolean occupied, Pageable pageable) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return yardSlotRepository
                .findByTenantIdAndWarehouseIdAndOccupied(tenantId, warehouseId, occupied, pageable)
                .map(YardSlotResponse::new);
    }
}
