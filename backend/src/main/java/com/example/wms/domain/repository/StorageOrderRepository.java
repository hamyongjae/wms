package com.example.wms.domain.repository;

import com.example.wms.domain.entity.StorageOrder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StorageOrderRepository extends JpaRepository<StorageOrder, Long> {

    Page<StorageOrder> findByTenantId(Long tenantId, Pageable pageable);

    boolean existsByOrderNumber(String orderNumber);
}