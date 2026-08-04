package com.example.wms.push.scheduler;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.push.service.WebPushService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * [긴급 알림 웹 푸시] 연체(고객 대상 촉구가 아니라 직원 본인 휴대폰 알림)를 매일 한 번,
 * 테넌트당 요약 1건으로 보낸다. 건별로 보내면 연체 20건일 때 20개가 오는 스팸이 되므로
 * 반드시 테넌트 단위로 묶는다. 이 잡은 읽기(연체 조회)와 외부 HTTP 발송뿐이라 DB 쓰기가
 * 없고, 조회 자체가 ROOT 컨텍스트(스케줄러 스레드는 인증 정보가 없어 기본 ROOT)에서
 * 테넌트 필터 없이 전체를 보므로 BillingLedgerIssuer류의 runAs 패턴은 필요 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PushDigestScheduler {

    private final BillingLedgerRepository billingLedgerRepository;
    private final WebPushService webPushService;

    @Scheduled(cron = "0 5 9 * * *")
    public void sendOverdueDigest() {
        List<BillingLedger> overdue = billingLedgerRepository.findAllOverdue(LocalDate.now());
        if (overdue.isEmpty()) return;

        Map<Long, List<BillingLedger>> byTenant = overdue.stream()
                .collect(Collectors.groupingBy(BillingLedger::getTenantId));

        int sent = 0;
        for (Map.Entry<Long, List<BillingLedger>> entry : byTenant.entrySet()) {
            List<BillingLedger> ledgers = entry.getValue();
            BigDecimal total = ledgers.stream()
                    .map(BillingLedger::outstandingBalance)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            String body = String.format("%d건 연체 · 총 %,d원", ledgers.size(), total.longValue());
            webPushService.sendToTenant(entry.getKey(), "연체 알림", body, "/billing?filter=OVERDUE");
            sent++;
        }
        log.info("[긴급알림] 연체 요약 푸시 발송 대상 테넌트 {}곳", sent);
    }
}
