package com.example.wms.billing.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 기본 알림 구현체 — 실제 발송 대신 로그로 남긴다.
 *
 * 알림톡 벤더 연동 전까지 개발/런칭 초기에 안전하게 동작한다.
 * 실제 구현체가 추가되면 그쪽에 @Primary 를 붙여 이 빈을 대체하면 된다.
 */
@Service
public class LoggingNotificationSender implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(LoggingNotificationSender.class);

    @Override
    public void send(BillingNotification n) {
        log.info("[알림발송:{}] tenant={} ledger={}({}) 고객={} 연락처={} 청구액={} 납기={}",
                n.type(), n.tenantId(), n.ledgerNo(), n.billingLedgerId(),
                n.customerName(), n.customerPhone(), n.amountDue(), n.dueDate());
    }
}
