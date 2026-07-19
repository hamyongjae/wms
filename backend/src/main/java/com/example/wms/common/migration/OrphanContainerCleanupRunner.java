package com.example.wms.common.migration;

import com.example.wms.container.entity.Container;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.yard.repository.YardSlotRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * [자동 self-heal] 계약과 연결이 끊긴 유령 컨테이너를 기동 시 한 번 정리한다.
 *
 * 배경: 계약(StorageOrder) 삭제 시 이제 서비스 계층에서 컨테이너·슬롯까지 연쇄 정리하지만,
 *       과거(연쇄 정리 도입 전)에 삭제된 계약의 컨테이너가 currentOrder=null 인 채 남아
 *       '컨테이너 관리' 화면에 유령으로 노출되는 문제가 있었다.
 *
 * 동작: 컨테이너는 항상 계약에 배정되어 생성되므로 currentOrder 가 없으면 유령이다.
 *       점유 슬롯을 공석 처리하고 컨테이너 행을 삭제한다.
 *
 * 안전성: 정상 데이터에서는 대상이 0건이라 아무 것도 하지 않는 멱등 작업.
 *         런타임엔 유령이 생기지 않으므로(삭제 시 연쇄 정리) 이후 기동에선 항상 0건 → 자가 치유.
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class OrphanContainerCleanupRunner implements ApplicationRunner {

    private final ContainerRepository containerRepository;
    private final YardSlotRepository yardSlotRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<Container> orphans = containerRepository.findByCurrentOrderIsNull();
        if (orphans.isEmpty()) {
            log.info("[컨테이너 정합화] 유령 컨테이너 없음 (정상).");
            return;
        }
        for (Container c : orphans) {
            yardSlotRepository.findByContainerId(c.getId()).ifPresent(slot -> slot.vacate());
            containerRepository.delete(c);
        }
        log.info("[컨테이너 정합화] 계약 연결이 끊긴 유령 컨테이너 {}건을 정리했습니다.", orphans.size());
    }
}
