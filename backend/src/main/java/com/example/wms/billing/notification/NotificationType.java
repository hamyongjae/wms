package com.example.wms.billing.notification;

public enum NotificationType {
    PAYMENT_REQUEST,    // 결제(수금) 안내
    OVERDUE_REMINDER,   // 미납 촉구
    PAYMENT_RECEIPT     // 수금 완료 영수 안내
}
