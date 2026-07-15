package com.example.wms.order.repository;

import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StorageOrderRepository extends JpaRepository<StorageOrder, Long> {

    // [테넌트 격리] id로 찾되 반드시 해당 tenant 소유여야만 반환
    Optional<StorageOrder> findByIdAndTenantId(Long id, Long tenantId);

    Page<StorageOrder> findByTenantId(Long tenantId, Pageable pageable);

    boolean existsByOrderNumber(String orderNumber);

    // [배치] 전 테넌트 대상 활성 계약 조회 (스케줄러 월 청구 생성용)
    List<StorageOrder> findByStatusIn(Collection<OrderStatus> statuses);
}
