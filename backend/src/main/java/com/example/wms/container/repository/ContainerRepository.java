package com.example.wms.container.repository;

import com.example.wms.container.entity.Container;
import com.example.wms.container.entity.ContainerStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ContainerRepository extends JpaRepository<Container, Long> {

    // [격리] id로 찾되 반드시 해당 tenant 소유일 때만
    Optional<Container> findByIdAndTenantId(Long id, Long tenantId);

    Page<Container> findByTenantId(Long tenantId, Pageable pageable);

    // [캘린더] 해당 테넌트의 전체 컨테이너 (입고/출고 예정 이벤트 파생용)
    List<Container> findAllByTenantId(Long tenantId);

    // 창고별 조회
    Page<Container> findByTenantIdAndWarehouseId(Long tenantId, Long warehouseId, Pageable pageable);

    // [화주 검색] 창고 내 전체 컨테이너 (memo 화주 태그 파싱용, 경계가 있어 전량 로드 OK)
    List<Container> findAllByTenantIdAndWarehouseId(Long tenantId, Long warehouseId);

    // 상태별 조회 (빈 컨테이너 찾기 등)
    Page<Container> findByTenantIdAndStatus(Long tenantId, ContainerStatus status, Pageable pageable);

    Page<Container> findByTenantIdAndWarehouseIdAndStatus(
            Long tenantId, Long warehouseId, ContainerStatus status, Pageable pageable);

    // 번호 중복 확인 (업체 내 유일)
    boolean existsByTenantIdAndContainerNo(Long tenantId, String containerNo);

    // 점유 현황 집계용 카운트
    long countByTenantIdAndWarehouseId(Long tenantId, Long warehouseId);

    // [창고 삭제] 창고에 속한 컨테이너 일괄 삭제 — 삭제된 행 수 반환
    long deleteByTenantIdAndWarehouseId(Long tenantId, Long warehouseId);
    long countByTenantIdAndWarehouseIdAndStatus(Long tenantId, Long warehouseId, ContainerStatus status);

    /**
     * [동시성] 배정/회수 임계 구간용 비관적 쓰기 락.
     * 같은 빈 컨테이너를 두 트랜잭션이 동시에 배정하려 하면 한쪽은 대기 → 이중 배정 방지.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Container c where c.id = :id and c.tenant.id = :tenantId")
    Optional<Container> findForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);

    // 특정 계약이 점유 중인 컨테이너 목록
    List<Container> findByTenantIdAndCurrentOrderId(Long tenantId, Long currentOrderId);

    // [캘린더 - 출고 위치] 여러 계약을 한 번에 — currentOrderId는 출고 후에도 재배정 전까지 유지되므로
    // releasedSlotId(출고 시 비운 자리)로 '출고 시점 위치'를 되짚어볼 때 쓴다.
    List<Container> findByTenantIdAndCurrentOrderIdIn(Long tenantId, java.util.Collection<Long> currentOrderIds);

    // [정합화] 계약 연결이 끊긴 유령 컨테이너 (전 테넌트 — 기동 시 self-heal용)
    List<Container> findByCurrentOrderIsNull();
}
