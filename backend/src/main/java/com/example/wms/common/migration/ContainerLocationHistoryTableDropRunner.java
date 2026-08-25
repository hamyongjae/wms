package com.example.wms.common.migration;

import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * [1회성 정리] 계약 위치 이력을 전체 기록 대신 '가장 최근 출고 위치'만 쓰기로 스코프를
 * 줄이면서, 로그 전용으로 쓰던 container_location_histories 테이블은 더 이상 어떤 코드도
 * 읽거나 쓰지 않는다 — ddl-auto=update는 안 쓰는 테이블을 자동으로 지우지 않으므로 직접 정리한다.
 * 이미 지워졌으면 조용히 넘어간다(멱등) — 확인되면 이 러너 자체도 지워도 된다.
 */
@Slf4j
@Component
@Order(50)
@RequiredArgsConstructor
public class ContainerLocationHistoryTableDropRunner implements ApplicationRunner {

    private final EntityManager entityManager;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        entityManager.createNativeQuery("DROP TABLE IF EXISTS container_location_histories").executeUpdate();
        log.info("[위치 이력 테이블 정리] container_location_histories 정리 완료(이미 없었다면 무시).");
    }
}
