package com.example.wms.yard.repository;

import com.example.wms.yard.entity.YardSlot;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface YardSlotRepository extends JpaRepository<YardSlot, Long> {

    // [격리] id로 찾되 반드시 해당 tenant 소유일 때만
    Optional<YardSlot> findByIdAndTenantId(Long id, Long tenantId);

    Page<YardSlot> findByTenantIdAndWarehouseId(Long tenantId, Long warehouseId, Pageable pageable);

    // 창고의 모든 슬롯 (추천 알고리즘용 — 경계가 있는 야적장이라 전량 로드 OK)
    List<YardSlot> findByTenantIdAndWarehouseId(Long tenantId, Long warehouseId);

    boolean existsByTenantIdAndWarehouseIdAndBlockAndRowNoAndColumnNoAndTier(
            Long tenantId, Long warehouseId, String block, Integer rowNo, Integer columnNo, Integer tier);

    // 특정 컨테이너가 현재 놓인 슬롯
    Optional<YardSlot> findByTenantIdAndContainerId(Long tenantId, Long containerId);

    /**
     * [동시성] 적재/이동 임계 구간용 비관적 쓰기 락.
     * 같은 슬롯을 두 트랜잭션이 동시에 점유하려 하면 한쪽은 대기 → 이중 적재 방지.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from YardSlot s where s.id = :id and s.tenant.id = :tenantId")
    Optional<YardSlot> findForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);
    // ===================== 점유 현황(대시보드) =====================

    // 창고 총 슬롯 수 / 점유 수
    long countByTenantIdAndWarehouseId(Long tenantId, Long warehouseId);
    long countByTenantIdAndWarehouseIdAndOccupied(Long tenantId, Long warehouseId, boolean occupied);

    // 컨테이너 점유 현황(점유/공실 슬롯 목록, 페이징)
    Page<YardSlot> findByTenantIdAndWarehouseIdAndOccupied(
            Long tenantId, Long warehouseId, boolean occupied, Pageable pageable);

    // 블록별 점유 집계 (특정 창고)
    @Query("""
            select s.block as block,
                   count(s) as total,
                   sum(case when s.occupied = true then 1 else 0 end) as occupied
            from YardSlot s
            where s.tenant.id = :tenantId and s.warehouse.id = :warehouseId
            group by s.block
            order by s.block
            """)
    List<BlockOccupancyView> aggregateByBlock(@Param("tenantId") Long tenantId,
                                              @Param("warehouseId") Long warehouseId);

    // 창고별 점유 집계 (테넌트 전체)
    @Query("""
            select s.warehouse.id as warehouseId,
                   s.warehouse.name as warehouseName,
                   count(s) as total,
                   sum(case when s.occupied = true then 1 else 0 end) as occupied
            from YardSlot s
            where s.tenant.id = :tenantId
            group by s.warehouse.id, s.warehouse.name
            order by s.warehouse.id
            """)
    List<WarehouseOccupancyView> aggregateByWarehouse(@Param("tenantId") Long tenantId);
}
