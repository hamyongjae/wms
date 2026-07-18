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
 * [배치 작업] 계약 상태 자동 평가
 *
 * 매일 자정(00:00)에 실행되어, 모든 활성 계약의 상태를 현재 날짜 기준으로 재평가한다.
 * - 슬롯 미지정 → PENDING (입고예정)
 * - 슬롯 지정 + 기간 내 → IN_STORAGE (보관중)
 * - 슬롯 지정 + 기간 외 미출고 → PENDING_RELEASE (출고예정)
 * - 출고완료/취소는 변경하지 않음
 *
 * [성능 최적화]
 * - 배치 시점에만 상태 전이 수행 (조회 시 계산 없음)
 * - 슬롯 지정/해제, 출고 처리 등 이벤트 발생 시 즉시 상태 갱신
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderStatusEvaluationBatch {

    private final StorageOrderRepository storageOrderRepository;

    /**
     * [서버 기동 시] 애플리케이션 초기화 시점에 배치 한 번 실행
     * 서버 시작 직후 계약 상태를 현재 기준으로 재평가
     */
    @PostConstruct
    public void initOnStartup() {
        log.info("[초기화] 서버 기동 시 계약 상태 평가 실행");
        evaluateAllOrdersStatus();
    }

    /**
     * 매일 자정에 계약 상태 일괄 평가
     * cron = "0 0 0 * * *" → 매일 00:00:00 실행
     */
    @Scheduled(cron = "0 0 0 * * *")
    @Transactional
    public void evaluateAllOrdersStatus() {
        log.info("[배치] 계약 상태 자동 평가 시작");

        // 활성 상태(RELEASED, CANCELLED 제외)의 모든 계약 조회
        List<StorageOrder> activeOrders = storageOrderRepository.findByStatusNotIn(
                java.util.List.of(OrderStatus.RELEASED, OrderStatus.CANCELLED)
        );

        int updated = 0;
        LocalDate today = LocalDate.now();

        for (StorageOrder order : activeOrders) {
            OrderStatus oldStatus = order.getStatus();
            order.evaluateStatus();
            if (order.getStatus() != oldStatus) {
                updated++;
                log.debug(
                        "계약 상태 변경: [{}] {} → {}",
                        order.getId(),
                        oldStatus,
                        order.getStatus()
                );
            }
        }

        log.info(
                "[배치] 계약 상태 자동 평가 완료: 대상 {} 건, 변경 {} 건",
                activeOrders.size(),
                updated
        );
    }
}
