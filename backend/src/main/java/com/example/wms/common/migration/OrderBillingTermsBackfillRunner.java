package com.example.wms.common.migration;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;

/**
 * [자동 self-heal] 계약에 청구 조건(결제 방식·납기일)이 비어 있는 레거시 행을 채운다.
 *
 * 배경: '계약이 자기 청구 조건을 기억' 도입 전에 만들어진 계약은 paymentType/dueDate 가 null 이다.
 *       계약 수정 팝업이 결제 방식·납기일을 정확히 프리필하려면 이 값이 필요하다.
 *
 * 동작: paymentType 이 null 인 계약마다 가장 늦은 활성 원장의 정산 방식·납기일을 그대로 복사한다.
 * 안전성: 이미 값이 있으면 대상이 아니라 멱등 — 이후 기동에선 0건.
 */
@Slf4j
@Component
@Order(31)
@RequiredArgsConstructor
public class OrderBillingTermsBackfillRunner implements ApplicationRunner {

    private final StorageOrderRepository storageOrderRepository;
    private final BillingLedgerRepository billingLedgerRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int patched = 0;
        for (StorageOrder order : storageOrderRepository.findAll()) {
            if (order.getPaymentType() != null) continue;   // 이미 채워짐

            BillingLedger active = billingLedgerRepository.findByStorageOrderId(order.getId()).stream()
                    .filter(l -> l.getStatus() != BillingStatus.CANCELED
                            && l.getStatus() != BillingStatus.CARRIED_OVER)
                    .max(Comparator.comparing(BillingLedger::getBillingPeriodStart))
                    .orElse(null);
            if (active == null) continue;   // 원장이 없으면 판단 불가 → 그대로 둠

            order.setPaymentType(active.getSettlementType());
            order.setDueDate(active.getDueDate());
            patched++;
        }
        if (patched > 0) {
            log.info("[청구조건 정합화] 결제 방식·납기일이 비어 있던 계약 {}건을 원장 기준으로 채웠습니다.", patched);
        } else {
            log.info("[청구조건 정합화] 대상 없음 (정상).");
        }
    }
}
