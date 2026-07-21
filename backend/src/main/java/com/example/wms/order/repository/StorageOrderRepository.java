package com.example.wms.order.repository;

import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface StorageOrderRepository extends JpaRepository<StorageOrder, Long> {

    // [테넌트 격리] id로 찾되 반드시 해당 tenant 소유여야만 반환
    Optional<StorageOrder> findByIdAndTenantId(Long id, Long tenantId);

    Page<StorageOrder> findByTenantId(Long tenantId, Pageable pageable);

    // [캘린더] 해당 테넌트의 전체 계약 (입고/출고 이벤트 파생용)
    List<StorageOrder> findAllByTenantId(Long tenantId);

    // [배치] 전 테넌트 대상 활성 계약 조회 (스케줄러 월 청구 생성용)
    List<StorageOrder> findByStatusIn(Collection<OrderStatus> statuses);

    /**
     * [매출 구멍 차단] 청구 원장이 하나도 없는 활성(입고) 계약을 단일 NOT EXISTS 쿼리로 찾는다.
     * 계약별로 원장 테이블을 반복 조회(N+1)하지 않고, 취소되지 않은 원장 존재 여부만 상관 서브쿼리로 판정.
     * (idx_ledger_order 인덱스를 타므로 풀 스캔 없이 결손 계약만 걸러낸다)
     */
    @Query("""
            select o from StorageOrder o
            where o.status = com.example.wms.order.entity.OrderStatus.INBOUND
              and not exists (
                    select 1 from BillingLedger l
                    where l.storageOrder = o
                      and l.status <> com.example.wms.billing.entity.BillingStatus.CANCELED)
            """)
    List<StorageOrder> findActiveWithoutLedger();
}
