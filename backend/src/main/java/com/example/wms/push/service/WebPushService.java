package com.example.wms.push.service;

import com.example.wms.push.entity.PushSubscription;
import com.example.wms.push.repository.PushSubscriptionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Subscription;
import org.apache.http.HttpResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.GeneralSecurityException;
import java.util.List;
import java.util.Map;

/**
 * [웹 푸시 발송] VAPID 서명·payload 암호화는 라이브러리(nl.martijndwars:web-push)에 위임한다.
 * 발송 실패는 배치를 절대 죽이면 안 되므로 전부 여기서 삼킨다(호출자는 성공/실패를 신경 쓰지
 * 않는다) — 구독이 만료된 경우(410/404)만 DB에서 정리한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WebPushService {

    private final PushSubscriptionRepository subscriptionRepository;
    // [빈 주입 대신 직접 생성] payload가 title/body/url 세 문자열뿐인 단순 JSON이라,
    // 앱 전역 ObjectMapper 빈에 기대지 않고 이 클래스 안에서 자체 완결시킨다.
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${push.vapid.public-key}")
    private String vapidPublicKey;

    @Value("${push.vapid.private-key}")
    private String vapidPrivateKey;

    @Value("${push.vapid.subject}")
    private String vapidSubject;

    private PushService pushService;

    @PostConstruct
    void init() throws GeneralSecurityException {
        this.pushService = new PushService(vapidPublicKey, vapidPrivateKey, vapidSubject);
    }

    public String getPublicKey() {
        return vapidPublicKey;
    }

    /** 특정 테넌트 소속 전 사용자의 전 구독에 같은 알림을 보낸다(테넌트당 요약 1건 발송 용도). */
    public void sendToTenant(Long tenantId, String title, String body, String url) {
        List<PushSubscription> subs = subscriptionRepository.findAllByUser_Tenant_Id(tenantId);
        for (PushSubscription sub : subs) {
            send(sub, title, body, url);
        }
    }

    private void send(PushSubscription sub, String title, String body, String url) {
        try {
            String payload = objectMapper.writeValueAsString(Map.of("title", title, "body", body, "url", url));
            Subscription subscription = new Subscription(
                    sub.getEndpoint(), new Subscription.Keys(sub.getP256dh(), sub.getAuth()));
            Notification notification = new Notification(subscription, payload);
            HttpResponse response = pushService.send(notification);
            int status = response.getStatusLine().getStatusCode();
            if (status == 404 || status == 410) {
                // 브라우저가 스스로 구독을 해지했거나 만료된 경우 — 조용히 정리
                subscriptionRepository.delete(sub);
                log.info("[웹푸시] 만료 구독 정리 endpoint={}", sub.getEndpoint());
            } else if (status >= 300) {
                log.warn("[웹푸시] 발송 실패 status={} endpoint={}", status, sub.getEndpoint());
            }
        } catch (Exception e) {
            // [방어] 발송 실패가 배치·API 흐름을 끊으면 안 된다 — 로그만 남기고 계속 진행
            log.warn("[웹푸시] 발송 중 예외 endpoint={}: {}", sub.getEndpoint(), e.getMessage());
        }
    }
}
