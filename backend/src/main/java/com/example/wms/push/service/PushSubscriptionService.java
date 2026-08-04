package com.example.wms.push.service;

import com.example.wms.push.dto.PushSubscribeRequest;
import com.example.wms.push.entity.PushSubscription;
import com.example.wms.push.repository.PushSubscriptionRepository;
import com.example.wms.security.SecurityUtils;
import com.example.wms.user.entity.User;
import com.example.wms.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PushSubscriptionService {

    private final PushSubscriptionRepository subscriptionRepository;
    private final UserRepository userRepository;

    /** 현재 로그인한 사용자의 구독으로 저장/갱신한다(같은 endpoint면 최신 키로 덮어씀). */
    @Transactional
    public void subscribe(PushSubscribeRequest request) {
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("사용자를 찾을 수 없습니다."));

        subscriptionRepository.findByEndpoint(request.getEndpoint())
                .ifPresentOrElse(
                        existing -> existing.refresh(
                                request.getKeys().getP256dh(), request.getKeys().getAuth(), request.getUserAgent()),
                        () -> subscriptionRepository.save(new PushSubscription(
                                user, request.getEndpoint(),
                                request.getKeys().getP256dh(), request.getKeys().getAuth(), request.getUserAgent())));
    }

    /** [본인 것만 해제] 남의 endpoint를 지우지 못하도록 소유자를 확인한다. */
    @Transactional
    public void unsubscribe(String endpoint) {
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        subscriptionRepository.findByEndpoint(endpoint).ifPresent(sub -> {
            if (sub.getUser().getId().equals(userId)) {
                subscriptionRepository.delete(sub);
            }
        });
    }

    /** 설정 화면에서 "이 기기 구독 중" 여부 표시용 */
    @Transactional(readOnly = true)
    public boolean isSubscribed(String endpoint) {
        return subscriptionRepository.findByEndpoint(endpoint)
                .map(sub -> sub.getUser().getId().equals(SecurityUtils.getCurrentUser().getUserId()))
                .orElse(false);
    }
}
