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

    /**
     * [기간 조회] 청구 기간이 [from, to]와 겹치는 원장만 조회 (인덱스 idx_ledger_tenant_period 활용).
     * 겹침 조건: 시작일 <= to  AND  종료일 >= from  → 자바 전체 로드 후 필터링 낭비 제거.
     */
    @Query("""
            select l from BillingLedger l
            where l.tenant.id = :tenantId
              and l.billingPeriodStart <= :to
              and l.billingPeriodEnd >= :from
            """)
    Page<BillingLedger> findByTenantIdAndPeriodOverlap(
            @Param("tenantId") Long tenantId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            Pageable pageable);

    Page<BillingLedger> findByTenantIdAndStatus(Long tenantId, BillingStatus status, Pageable pageable);

    // [캘린더] 해당 테넌트의 전체 원장 (청구 이벤트 파생용)
    List<BillingLedger> findAllByTenantId(Long tenantId);

    boolean existsByLedgerNo(String ledgerNo);

    // [배치] 같은 계약·같은 청구기간 원장이 이미 있는지 (월 청구 중복 생성 방지)
    boolean existsByStorageOrderIdAndBillingPeriodStart(Long storageOrderId, LocalDate billingPeriodStart);

    /**
     * [이중청구 방지] 특정 계약에 대해 [from, to] 기간과 겹치는 '취소 아닌' 원장이 있는지.
     * 계약 등록 시 자동 발행한 청구서와 월 배치 청구서가 같은 구간을 중복 청구하지 않도록,
     * 정확한 시작일 일치가 아니라 '기간 겹침'으로 판정한다. (idx_ledger_order 인덱스 활용)
     */
    @Query("""
            select case when count(l) > 0 then true else false end
            from BillingLedger l
            where l.storageOrder.id = :orderId
              and l.status <> com.example.wms.billing.entity.BillingStatus.CANCELED
              and l.billingPeriodStart <= :to
              and l.billingPeriodEnd >= :from
            """)
    boolean existsActiveLedgerOverlapping(@Param("orderId") Long orderId,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to);

    // [계약 삭제] 특정 계약에 연결된 모든 청구 원장 조회 (cascade 삭제용)
    List<BillingLedger> findByStorageOrderId(Long storageOrderId);

    /**
     * [동시성] 수금/조정 같은 임계 구간용 비관적 쓰기 락.
     * 같은 원장을 두 트랜잭션이 동시에 갱신하면 한쪽은 대기 → 갱신 유실 방지.
     * (낙관적 @Version 과 함께 이중 방어)
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from BillingLedger l where l.id = :id and l.tenant.id = :tenantId")
    Optional<BillingLedger> findForUpdate(@Param("id") Long id, @Param("tenantId") Long tenantId);

    /** 미납(잔액 > 0) & 납기 경과 원장 — 특정 테넌트 대상 */
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

    /** [배치] 전 테넌트 대상 미납 원장 — 스케줄러 미납 촉구용 */
    @Query("""
            select l from BillingLedger l
            where l.balance > 0
              and l.status in (com.example.wms.billing.entity.BillingStatus.ISSUED,
                               com.example.wms.billing.entity.BillingStatus.PARTIALLY_PAID)
              and l.dueDate < :baseDate
            """)
    List<BillingLedger> findAllOverdue(@Param("baseDate") LocalDate baseDate);
}
