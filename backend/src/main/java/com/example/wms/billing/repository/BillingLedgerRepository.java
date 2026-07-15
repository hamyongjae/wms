package com.example.wms.billing.repository;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BillingLedgerRepository extends JpaRepository<BillingLedger, Long> {

    // [격리] 일반 조회 — 반드시 tenant 소유일 때만
    Optional<BillingLedger> findByIdAndTenantId(Long id, Long tenantId);

    Page<BillingLedger> findByTenantId(Long tenantId, Pageable pageable);

    Page<BillingLedger> findByTenantIdAndStatus(Long tenantId, BillingStatus status, Pageable pageable);

    boolean existsByLedgerNo(String ledgerNo);

    /**
     * [동시성] 수금/조정 같은 임계 구간용 비관적 쓰기 락.
     * 같은 원장을 두 트랜잭션이 동시에 갱신하면 한쪽은 대기 → 갱신 유실 방지.
     * (낙관적 @Version 과 함께 이중 방어)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from BillingLedger l where l.id = :id and l.tenant.id = :tenantId")
    Optional<BillingLedger> findForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);

    /** 미납(잔액 > 0) & 납기 경과 원장 — 미납 알림 대상 */
    @Query("""
            select l from BillingLedger l
            where l.tenant.id = :tenantId
              and l.balance > 0
              and l.status in (com.example.wms.billing.entity.BillingStatus.ISSUED,
                               com.example.wms.billing.entity.BillingStatus.PARTIALLY_PAID)
              and l.dueDate < :baseDate
            """)
    List<BillingLedger> findOverdue(@Param("tenantId") Long tenantId,
                                    @Param("baseDate") LocalDate baseDate);
}
