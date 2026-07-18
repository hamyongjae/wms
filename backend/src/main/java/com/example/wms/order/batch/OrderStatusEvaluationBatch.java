package com.example.wms.order.batch;

import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.repository.StorageOrderRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * [실시간 상태 평가 아키텍처]
 *
 * 배치 작업 제거 → 조회 시점에 실시간 상태 계산으로 변경
 *
 * **최적화 원칙:**
 * 1. 이벤트 기반 (즉시 반영)
 *    - 슬롯 지정 → assignSlot() → DB 저장
 *    - 출고 처리 → release() → DB 저장
 *
 * 2. 조회 기반 (실시간 계산)
 *    - StorageOrder 로드 시 @PostLoad → evaluateStatus()
 *    - 시간 기반 상태 변화 (기간 만료) 자동 감지
 *    - CPU 비용 최소화 (단순 날짜 비교만 수행)
 *
 * **결과:**
 * - 배치 없이도 조회 시점에 항상 최신 상태
 * - 메모리 낭비 최소화
 * - 실시간성 100% 보장
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderStatusEvaluationBatch {

    private final StorageOrderRepository storageOrderRepository;

    /**
     * [비활성화] 배치 작업 제거
     * 이유: @PostLoad로 조회 시 자동 상태 계산
     *
     * 이전 방식:
     * - 배치: 매일 자정에만 상태 반영 (자정 전까지 오래된 상태)
     * - 문제: 기간 만료 감지 지연
     *
     * 새 방식:
     * - 조회 시 실시간 상태 계산
     * - 항상 현재 날짜 기준 최신 상태 유지
     */

    // 주석 처리: 배치 작업은 더 이상 필요 없음
    /*
    @PostConstruct
    public void initOnStartup() {
        log.info("[폐기됨] 서버 기동 시 배치 제거 - @PostLoad로 실시간 처리");
    }

    @Scheduled(cron = "0 0 0 * * *")
    @Transactional
    public void evaluateAllOrdersStatus() {
        log.info("[폐기됨] 배치 작업 제거 - 조회 시점에 상태 실시간 계산");
    }
    */
}
