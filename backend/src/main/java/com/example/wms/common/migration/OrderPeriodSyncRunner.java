package com.example.wms.common.migration;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.order.entity.StorageOrder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * [보관기간 정합화] 연속 계약(회차 청구)으로 이미 여러 회차가 쌓인 기존 계약의
 * 출고예정일을 '가장 늦은 청구 회차 종료일'로 맞춘다.
 *
 * 배경: 이제 회차 청구·이월 시 계약 보관기간을 자동 확장하지만, 그 로직 도입 전에
 *       2회차 이상 정산된 계약은 첫 회차 종료일에 머물러 있어 계약·달력이 실제와 어긋난다.
 *
 * 안전성: 출고 완료(OUTBOUND) 계약은 건드리지 않고, 종료일을 늘리기만 하는 멱등 작업.
 */
@Slf4j
@Component
@Order(30)
@RequiredArgsConstructor
public class OrderPeriodSyncRunner implements ApplicationRunner {

    private final BillingLedgerRepository ledgerRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        // 계약별 가장 늦은 청구 종료일 집계 (취소 원장 제외)
        Map<StorageOrder, LocalDate> maxEndByOrder = new HashMap<>();
        for (BillingLedger l : ledgerRepository.findAll()) {
            if (l.getStatus() == BillingStatus.CANCELED) continue;
            LocalDate end = l.getBillingPeriodEnd();
            if (end == null) continue;
            StorageOrder order = l.getStorageOrder();
            LocalDate cur = maxEndByOrder.get(order);
            if (cur == null || end.isAfter(cur)) {
                maxEndByOrder.put(order, end);
            }
        }

        int updated = 0;
        for (Map.Entry<StorageOrder, LocalDate> e : maxEndByOrder.entrySet()) {
            StorageOrder order = e.getKey();
            LocalDate maxEnd = e.getValue();
            if (order.isOutbound()) continue; // 출고 완료 계약은 확정
            LocalDate current = order.getExpectedEndDate();
            // [출고일 미정 보존] 종료일이 없는(1층처럼 계속 쓰는) 계약은 서버 재기동마다 도는 이
            // 정합화가 건드리면 안 된다 — BillingLedgerIssuer/BillingService의 동일 규칙과 통일.
            if (current == null) continue;
            if (maxEnd.isAfter(current)) {
                order.setExpectedEndDate(maxEnd);  // dirty checking 으로 반영
                updated++;
            }
        }

        if (updated > 0) {
            log.info("[보관기간 정합화] 연속 계약 {}건의 보관기간을 최종 회차 종료일로 확장했습니다.", updated);
        } else {
            log.info("[보관기간 정합화] 확장 대상 없음 (이미 일치).");
        }
    }
}
