package com.example.wms.common.migration;

import com.example.wms.container.entity.Container;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * [일회성 데이터 정합화] 계약↔컨테이너 입출고 일정 재동기화.
 *
 * 배경: 과거엔 계약(StorageOrder)의 보관기간과 컨테이너(Container)의 입고/출고예정일이
 *       별도로 저장돼(생성 시 스냅샷) 계약을 수정해도 컨테이너가 옛 날짜로 남는 문제가 있었다.
 *       이제 계약을 '단일 소스'로 삼아 서비스 계층에서 전파하지만, 이미 어긋나 있는 기존
 *       데이터는 자동 보정되지 않으므로 앱 기동 시 한 번 훑어 계약 기준으로 맞춘다.
 *
 * 안전성: 계약 기간을 컨테이너에 덮어쓰기만 하는 멱등(idempotent) 작업이라 여러 번 실행돼도
 *        결과가 같다. 다만 매 기동마다 도는 비용을 피하려면 정합화 후 아래 프로퍼티를 false로
 *        두면 된다: `wms.migration.sync-container-schedules=false`
 * 격리: 컨테이너는 계약의 tenant 범위 안에서만 조회하므로 테넌트 간 침범이 없다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "wms.migration.sync-container-schedules", havingValue = "true", matchIfMissing = true)
public class ContainerScheduleSyncRunner implements ApplicationRunner {

    private final StorageOrderRepository storageOrderRepository;
    private final ContainerRepository containerRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        int orders = 0;
        int updated = 0;

        for (StorageOrder order : storageOrderRepository.findAll()) {
            orders++;
            Long tenantId = order.getTenant().getId();
            LocalDate start = order.getStorageStartDate();
            // 출고 완료 계약은 실제 출고일, 그 외엔 출고 예정일을 컨테이너 출고예정일로 본다.
            LocalDate end = order.getActualEndDate() != null
                    ? order.getActualEndDate() : order.getExpectedEndDate();

            for (Container c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
                boolean stale = !java.util.Objects.equals(c.getInboundDate(), start)
                        || !java.util.Objects.equals(c.getExpectedOutboundDate(), end);
                if (stale) {
                    c.setStorageDates(start, end);   // 계약 기준으로 확정 (JPA dirty checking으로 반영)
                    updated++;
                }
            }
        }

        if (updated > 0) {
            log.info("[일정 정합화] 계약 {}건 점검 → 컨테이너 {}건의 입출고 일정을 계약 기준으로 동기화했습니다.",
                    orders, updated);
        } else {
            log.info("[일정 정합화] 계약 {}건 점검 → 이미 모두 일치(변경 없음).", orders);
        }
    }
}
