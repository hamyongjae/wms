package com.example.wms.billing.notification;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 알림 발송 페이로드 (채널 독립적).
 *
 * 특정 벤더(카카오 알림톡 등)에 종속되지 않도록 순수 데이터만 담는다.
 * 실제 구현체가 이 값을 템플릿에 매핑해 발송한다.
 */
public record BillingNotification(
        Long tenantId,
        Long billingLedgerId,
        String ledgerNo,
        NotificationType type,
        String customerName,
        String customerPhone,
        BigDecimal amountDue,
        LocalDate dueDate
) {
}
