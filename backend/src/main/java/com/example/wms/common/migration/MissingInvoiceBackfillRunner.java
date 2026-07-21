package com.example.wms.common.migration;

import com.example.wms.billing.service.BillingBatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * [자동 self-heal] 청구 원장이 하나도 없는 활성 계약(매출 구멍)을 기동 시 한 번 보정한다.
 *
 * 배경: '계약 등록 시 청구서 자동 발행' 도입 전에 만들어진 후불 계약은 원장이 없어
 *       매출·미수 집계에서 통째로 빠진다. 운영 서버를 새 코드로 재기동하는 순간
 *       결손 계약에 후불 청구서를 소급 발행해 매출 구멍을 메운다.
 *
 * 효율: 결손 계약만 NOT EXISTS 단일 쿼리로 선별(BillingBatchService.backfillMissingLedgers).
 * 안전성: 이미 원장이 있으면 대상이 아니라 멱등 — 이후 기동에선 0건.
 */
@Slf4j
@Component
@Order(30)
@RequiredArgsConstructor
public class MissingInvoiceBackfillRunner implements ApplicationRunner {

    private final BillingBatchService billingBatchService;

    @Override
    public void run(ApplicationArguments args) {
        int created = billingBatchService.backfillMissingLedgers();
        if (created > 0) {
            log.info("[청구서 정합화] 청구서 누락 계약 {}건에 후불 청구서를 소급 발행했습니다.", created);
        } else {
            log.info("[청구서 정합화] 청구서 누락 계약 없음 (정상).");
        }
    }
}
