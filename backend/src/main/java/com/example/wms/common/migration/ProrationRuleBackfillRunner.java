package com.example.wms.common.migration;

import com.example.wms.billing.service.BillingBatchService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * [자동 정정 - 1회성] 완전한 롤링 개월수 회차를 "달마다 일할 나눠 합산"하던 예전 계산 방식 대신
 * "월 보관료 × N을 그대로 청구"하도록 규칙이 바뀌면서, 이미 발행됐지만 아직 미납인 원장 중
 * 예전 방식으로 어중간하게 청구된 것들을 새 규칙값으로 소급 정정한다.
 *
 * 완납·취소·이월된(닫힌) 원장은 건드리지 않고, 그 사이 월 보관료가 바뀌었거나 관리자가 금액을
 * 수동으로 고친 원장도(예전 방식 재현이 안 맞으면) 건드리지 않는다 — 안전한 대상만 정정한다.
 * 고칠 대상이 없으면(이미 정정됐거나 원래 없음) 이후 기동에선 항상 0건(멱등).
 */
@Slf4j
@Component
@Order(32)
@RequiredArgsConstructor
public class ProrationRuleBackfillRunner implements ApplicationRunner {

    private final BillingBatchService billingBatchService;

    @Override
    public void run(ApplicationArguments args) {
        int fixed = billingBatchService.recalcRollingMonthProration();
        if (fixed > 0) {
            log.info("[정산 규칙 정정] 완전한 롤링 개월수인데 예전 방식으로 어중간하게 청구된 미납 원장 {}건을 새 규칙값으로 정정했습니다.", fixed);
        } else {
            log.info("[정산 규칙 정정] 정정 대상 없음 (정상).");
        }
    }
}
