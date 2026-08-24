package com.example.wms.billing.repository;

import com.example.wms.billing.entity.PaymentHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PaymentHistoryRepository extends JpaRepository<PaymentHistory, Long> {

    Optional<PaymentHistory> findByIdAndTenantId(Long id, Long tenantId);

    List<PaymentHistory> findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(Long billingLedgerId, Long tenantId);

    // [계약 삭제] 원장에 연결된 입금 내역 일괄 삭제 (cascade)
    void deleteByBillingLedgerId(Long billingLedgerId);

    /**
     * [매출관리 - 입금일 기준] 취소되지 않은 입금 전량을 고객·계약 정보와 함께 한 번에 조회한다.
     * 청구기간 일할계산을 버리고 실제 입금일(paidOn) 그대로 매출로 잡기 위한 원천 데이터 —
     * 프론트가 조회 기간별로 다시 서버를 왕복하지 않도록 기간 제한 없이 전량을 내려주고
     * paidOn 필터링은 클라이언트에서 한다(원장 목록의 기존 '전체 재조회' 패턴과 동일).
     * 취소(CANCELED)된 원장에 달린 입금은 청구 자체가 무효라 제외한다.
     */
    @Query("""
            select p from PaymentHistory p
            join fetch p.billingLedger l
            join fetch l.customer c
            join fetch l.storageOrder o
            where p.tenantId = :tenantId
              and p.reversed = false
              and l.status <> com.example.wms.billing.entity.BillingStatus.CANCELED
            order by p.paidOn asc
            """)
    List<PaymentHistory> findRevenuePayments(@Param("tenantId") Long tenantId);
}
