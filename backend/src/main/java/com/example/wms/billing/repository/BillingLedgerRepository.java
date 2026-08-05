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

    /**
     * [일정 수정 시 겹침 검증] existsActiveLedgerOverlapping과 동일하지만, 지금 수정 중인
     * 원장 자기 자신은 겹침 대상에서 제외한다 — 아니면 기간을 그대로 저장만 해도 "자기 자신과
     * 겹친다"고 항상 막혀버린다.
     */
    @Query("""
            select case when count(l) > 0 then true else false end
            from BillingLedger l
            where l.storageOrder.id = :orderId
              and l.id <> :excludeLedgerId
              and l.status <> com.example.wms.billing.entity.BillingStatus.CANCELED
              and l.billingPeriodStart <= :to
              and l.billingPeriodEnd >= :from
            """)
    boolean existsActiveLedgerOverlappingExcluding(@Param("orderId") Long orderId,
                                                    @Param("from") LocalDate from,
                                                    @Param("to") LocalDate to,
                                                    @Param("excludeLedgerId") Long excludeLedgerId);

    // [계약 삭제] 특정 계약에 연결된 모든 청구 원장 조회 (cascade 삭제용)
    List<BillingLedger> findByStorageOrderId(Long storageOrderId);

    /**
     * [롤링 청구 배치] 계약의 취소 아닌 원장 중 청구기간 종료일이 가장 늦은 것.
     * 다음 회차의 시작일(=이 원장의 billingPeriodEnd + 1)을 구하는 기준이 된다.
     * CARRIED_OVER는 기간 자체는 유효하므로 포함하고, CANCELED만 제외한다
     * (existsActiveLedgerOverlapping과 동일한 판단 기준).
     */
    Optional<BillingLedger> findFirstByStorageOrderIdAndStatusNotOrderByBillingPeriodEndDesc(
            Long storageOrderId, BillingStatus status);

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

    /**
     * [차트 집계] 월별 청구·수금 합계 — 원장 필드를 DB에서 직접 GROUP BY 합산(런타임 풀스캔·앱단 집계 제거).
     *   billed    = base_amount + carried_over_in + adjustment_total (중도출고 차감·환불 조정 반영)
     *   collected = paid_total (환불 완료 시 차감분까지 반영)
     * 청구기간 시작월(period_start) 기준으로 묶으며, idx_ledger_tenant_period 인덱스를 탄다.
     * 반환: [ String yyyyMM, Number billed, Number collected ]
     */
    @Query(value = """
            select to_char(date_trunc('month', l.period_start), 'YYYY-MM') as ym,
                   coalesce(sum(l.base_amount + l.carried_over_in + l.adjustment_total), 0) as billed,
                   coalesce(sum(l.paid_total), 0) as collected
            from billing_ledgers l
            where l.tenant_id = :tenantId
              and l.status <> 'CANCELED'
              and l.period_start >= :from
              and l.period_start <= :to
            group by date_trunc('month', l.period_start)
            order by date_trunc('month', l.period_start)
            """, nativeQuery = true)
    List<Object[]> aggregateMonthlyRevenue(@Param("tenantId") Long tenantId,
                                           @Param("from") LocalDate from,
                                           @Param("to") LocalDate to);

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
