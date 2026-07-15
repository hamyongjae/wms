package com.example.wms.domain.repository;

import com.example.wms.domain.entity.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {

    // [테넌트 격리] id로 찾되 반드시 해당 tenant 소유여야만 반환
    Optional<Warehouse> findByIdAndTenantId(Long id, Long tenantId);

    // 특정 업체에 속한 창고 목록 조회
    List<Warehouse> findByTenantId(Long tenantId);
}