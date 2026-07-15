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
}
