package com.example.wms.push.repository;

import com.example.wms.push.entity.PushSubscription;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PushSubscriptionRepository extends JpaRepository<PushSubscription, Long> {

    /** 설정 화면에서 "내 구독 목록" 표시/구독 여부 확인용 */
    List<PushSubscription> findAllByUser_Id(Long userId);

    /** [푸시 발송 배치] 특정 테넌트 소속 전 사용자의 구독 — User가 @TenantId 대상이 아니라 명시 조회 */
    List<PushSubscription> findAllByUser_Tenant_Id(Long tenantId);

    Optional<PushSubscription> findByEndpoint(String endpoint);

    /** [구독 해제] 설정에서 토글을 끌 때 — 본인 소유인지는 컨트롤러에서 확인 후 호출 */
    void deleteByEndpoint(String endpoint);
}
