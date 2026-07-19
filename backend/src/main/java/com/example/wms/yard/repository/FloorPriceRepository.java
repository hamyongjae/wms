package com.example.wms.yard.repository;

import com.example.wms.yard.entity.FloorPrice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FloorPriceRepository extends JpaRepository<FloorPrice, Long> {

    // [단일 조건절] 창고의 층별 단가 전체 (층 개수만큼 — 최대 수 행)
    List<FloorPrice> findByTenantIdAndWarehouseId(Long tenantId, Long warehouseId);

    // [O(1)] 특정 (창고, 층) 단가 — 계약 등록 시 슬롯 층 단가 조회용
    Optional<FloorPrice> findByTenantIdAndWarehouseIdAndTier(Long tenantId, Long warehouseId, Integer tier);
}
