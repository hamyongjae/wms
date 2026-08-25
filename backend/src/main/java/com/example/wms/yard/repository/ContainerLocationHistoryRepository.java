package com.example.wms.yard.repository;

import com.example.wms.yard.entity.ContainerLocationHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface ContainerLocationHistoryRepository extends JpaRepository<ContainerLocationHistory, Long> {

    List<ContainerLocationHistory> findByTenantIdAndOrderIdOrderByOccurredAtAsc(Long tenantId, Long orderId);

    // [캘린더] 여러 계약을 한 번에 — 시간순 정렬은 CalendarService가 계약별로 묶으며 처리
    List<ContainerLocationHistory> findByTenantIdAndOrderIdIn(Long tenantId, Collection<Long> orderIds);

    // [계약 삭제] 연쇄 정리용
    void deleteByOrderId(Long orderId);
}
