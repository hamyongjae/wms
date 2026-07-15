package com.example.wms.billing.repository;

import com.example.wms.billing.entity.PaymentHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentHistoryRepository extends JpaRepository<PaymentHistory, Long> {

    Optional<PaymentHistory> findByIdAndTenantId(Long id, Long tenantId);

    List<PaymentHistory> findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(Long billingLedgerId, Long tenantId);
}
