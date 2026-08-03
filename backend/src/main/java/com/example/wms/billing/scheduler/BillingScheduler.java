package com.example.wms.billing.scheduler;

import com.example.wms.billing.service.BillingBatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * 청구 관련 정기 작업.
 *
 * - 매일 08:50: 청구서 누락 계약(원장 0건) self-heal
 * - 매일 08:55: 계약별로 도래한 다음 청구 주기 원장 생성(롤링 — 계약마다 직전 원장 종료일
 *   다음날 기준이라 생성일이 자연히 분산된다. 예전처럼 매달 1일에 전 계약이 한꺼번에
 *   몰리지 않는다)
 * - 매일 09:00: 미납 촉구 알림 발송(방금 생성된 원장 중 이미 연체인 것도 포함)
 *
 * 위 세 배치는 이 순서로만 실행되어야 한다 — self-heal이 먼저 결손 계약에 최초 원장을
 * 채워야 롤링 생성이 그 위에서 다음 회차를 이어갈 수 있고, 롤링 생성이 미납 촉구보다
 * 먼저 끝나야 그날 발행분까지 촉구 대상에 반영된다.
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

    /** 매일 오전 8시 50분 — 청구서 누락 계약(매출 구멍) self-heal (롤링 생성 직전에 결손 보정) */
    @Scheduled(cron = "0 50 8 * * *")
    public void backfillMissingLedgers() {
        int created = billingBatchService.backfillMissingLedgers();
        if (created > 0) {
            log.info("[청구배치] 청구서 누락 계약 self-heal: {}건 소급 발행", created);
        }
    }

    /** 매일 오전 8시 55분 — 계약별로 도래한 다음 청구 주기 원장 생성 */
    @Scheduled(cron = "0 55 8 * * *")
    public void generateDueLedgers() {
        LocalDate today = LocalDate.now();
        int created = billingBatchService.generateDueLedgers(today);
        if (created > 0) {
            log.info("[청구배치] {} 기준 정기 청구 원장 자동 생성: {}건", today, created);
        }
    }

    /** 매일 오전 9시 — 미납 촉구 알림 발송 */
    @Scheduled(cron = "0 0 9 * * *")
    public void sendOverdueReminders() {
        int sent = billingBatchService.sendAllOverdueReminders();
        log.info("[청구배치] 미납 촉구 발송 대상: {}건", sent);
    }
}
