package com.example.wms.billing.repository;

import com.example.wms.billing.entity.BillingAdjustment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface BillingAdjustmentRepository extends JpaRepository<BillingAdjustment, Long> {

    List<BillingAdjustment> findByBillingLedgerIdAndTenantIdOrderByCreatedAtAsc(Long billingLedgerId, Long tenantId);
}
