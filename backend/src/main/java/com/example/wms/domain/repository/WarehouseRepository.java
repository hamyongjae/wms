package com.example.wms.domain.repository;

import com.example.wms.domain.entity.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {

    // 특정 업체에 속한 창고 목록 조회
    List<Warehouse> findByTenantId(Long tenantId);
}