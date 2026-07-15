package com.example.wms.billing.notification;

/**
 * 알림 발송 요청 이벤트.
 *
 * 서비스는 발송을 직접 호출하지 않고 이 이벤트를 publish 한다.
 * → 청구/수금 로직과 발송 로직이 분리되고,
 *   리스너가 트랜잭션 커밋 이후에만 실제 발송하도록 제어할 수 있다.
 */
public record BillingNotificationEvent(BillingNotification notification) {
}
