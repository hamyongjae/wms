package com.example.wms.domain.repository;

import com.example.wms.domain.entity.StorageOrder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StorageOrderRepository extends JpaRepository<StorageOrder, Long> {

    // [테넌트 격리] id로 찾되 반드시 해당 tenant 소유여야만 반환
    Optional<StorageOrder> findByIdAndTenantId(Long id, Long tenantId);

    Page<StorageOrder> findByTenantId(Long tenantId, Pageable pageable);

    boolean existsByOrderNumber(String orderNumber);
}