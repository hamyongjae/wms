package com.example.wms.billing.scheduler;

import com.example.wms.billing.service.BillingBatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.YearMonth;

/**
 * 청구 관련 정기 작업.
 *
 * - 매월 1일 02:00: 이번 달 청구 원장 자동 생성(활성 계약 대상)
 * - 매일 09:00: 미납 촉구 알림 발송
 *
 * cron 형식: 초 분 시 일 월 요일
 */
@Component
public class BillingScheduler {

    private static final Logger log = LoggerFactory.getLogger(BillingScheduler.class);

    private final BillingBatchService billingBatchService;

    public BillingScheduler(BillingBatchService billingBatchService) {
        this.billingBatchService = billingBatchService;
    }

    /** 매월 1일 새벽 2시 — 이번 달 청구 원장 자동 생성 */
    @Scheduled(cron = "0 0 2 1 * *")
    public void generateMonthlyLedgers() {
        YearMonth target = YearMonth.now();
        int created = billingBatchService.generateMonthlyLedgers(target);
        log.info("[청구배치] {} 월 청구 원장 자동 생성: {}건", target, created);
    }

    /** 매일 오전 8시 50분 — 청구서 누락 계약(매출 구멍) self-heal (미납 촉구 직전에 결손 보정) */
    @Scheduled(cron = "0 50 8 * * *")
    public void backfillMissingLedgers() {
        int created = billingBatchService.backfillMissingLedgers();
        if (created > 0) {
            log.info("[청구배치] 청구서 누락 계약 self-heal: {}건 소급 발행", created);
        }
    }

    /** 매일 오전 9시 — 미납 촉구 알림 발송 */
    @Scheduled(cron = "0 0 9 * * *")
    public void sendOverdueReminders() {
        int sent = billingBatchService.sendAllOverdueReminders();
        log.info("[청구배치] 미납 촉구 발송 대상: {}건", sent);
    }
}
