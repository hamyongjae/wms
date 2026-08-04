package com.example.wms.push.controller;

import com.example.wms.push.dto.PushSubscribeRequest;
import com.example.wms.push.service.PushSubscriptionService;
import com.example.wms.push.service.WebPushService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 웹 푸시 구독 등록/해제 + VAPID 공개키 조회. */
@RestController
@RequestMapping("/api/push")
@RequiredArgsConstructor
public class PushController {

    private final PushSubscriptionService pushSubscriptionService;
    private final WebPushService webPushService;

    // 프론트가 pushManager.subscribe()에 넘길 공개키 (로그인한 사용자만 — 설정 화면에서만 쓰임)
    @GetMapping("/vapid-public-key")
    public ResponseEntity<Map<String, String>> getVapidPublicKey() {
        return ResponseEntity.ok(Map.of("publicKey", webPushService.getPublicKey()));
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<Void> subscribe(@Valid @RequestBody PushSubscribeRequest request) {
        pushSubscriptionService.subscribe(request);
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/subscriptions")
    public ResponseEntity<Void> unsubscribe(@RequestParam String endpoint) {
        pushSubscriptionService.unsubscribe(endpoint);
        return ResponseEntity.ok().build();
    }
}
