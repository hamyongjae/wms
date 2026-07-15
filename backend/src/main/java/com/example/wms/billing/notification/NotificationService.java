package com.example.wms.billing.notification;

/**
 * 외부 알림 발송 추상화.
 *
 * [확장성] 컨트롤러·서비스는 이 인터페이스에만 의존한다.
 * 지금은 로깅 구현체(LoggingNotificationSender)를 쓰고,
 * 나중에 카카오 알림톡 API 구현체(KakaoAlimtalkSender)를 만들어
 * @Primary 로 갈아끼우면 비즈니스 로직 변경 없이 실제 발송이 붙는다.
 */
public interface NotificationService {

    /** 청구/미납 알림 1건 발송 */
    void send(BillingNotification notification);
}
