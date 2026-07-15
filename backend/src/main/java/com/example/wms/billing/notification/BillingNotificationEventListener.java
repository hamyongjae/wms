package com.example.wms.billing.notification;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 알림 이벤트 리스너.
 *
 * [핵심] AFTER_COMMIT — DB 트랜잭션이 성공적으로 커밋된 뒤에만 실제 발송한다.
 * 청구 처리는 롤백됐는데 알림톡만 나가는 사고를 방지한다.
 * 발송 실패가 본 트랜잭션에 영향 주지 않도록 예외는 삼켜 로깅만 한다(초기 런칭 안전 우선).
 */
@Component
public class BillingNotificationEventListener {

    private final NotificationService notificationService;

    public BillingNotificationEventListener(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onBillingNotification(BillingNotificationEvent event) {
        try {
            notificationService.send(event.notification());
        } catch (Exception e) {
            // 발송 실패가 청구/수금 결과를 되돌리지 않도록 격리
            org.slf4j.LoggerFactory.getLogger(getClass())
                    .error("알림 발송 실패 ledger={}", event.notification().ledgerNo(), e);
        }
    }
}
