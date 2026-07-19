package com.example.wms.common.migration;

import com.example.wms.container.entity.Container;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
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
 * [자동 정합화] 이미 '출고완료'된 계약이 점유 중인 슬롯을 공실 처리한다.
 *
 * 배경: '출고 시 슬롯 자동 공실화' 로직 도입 전에 출고된 계약의 컨테이너가
 *       여전히 야적장 자리를 차지하고 있어 '컨테이너 관리'에 남아 보이는 문제.
 *
 * 동작: 출고완료(OUTBOUND) 계약의 컨테이너가 슬롯에 적재돼 있으면,
 *       그 슬롯을 vacate 하고 원자리를 컨테이너에 기억(출고취소 복구용)한다.
 *
 * 안전성: 이미 공실인 건 대상이 아니라 멱등. 이후 기동에선 0건.
 */
@Slf4j
@Component
@Order(25)
@RequiredArgsConstructor
public class ReleasedContainerSyncRunner implements ApplicationRunner {

    private final StorageOrderRepository storageOrderRepository;
    private final ContainerRepository containerRepository;
    private final YardSlotRepository yardSlotRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<StorageOrder> released = storageOrderRepository.findByStatusIn(List.of(OrderStatus.OUTBOUND));
        int vacated = 0;
        for (StorageOrder order : released) {
            Long tenantId = order.getTenant().getId();
            for (Container c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
                var slotOpt = yardSlotRepository.findByTenantIdAndContainerId(tenantId, c.getId());
                if (slotOpt.isPresent()) {
                    var slot = slotOpt.get();
                    c.markReleasedFromSlot(slot.getId());
                    slot.vacate();
                    vacated++;
                }
            }
        }
        if (vacated > 0) {
            log.info("[출고 자리 정합화] 출고완료 계약의 점유 슬롯 {}건을 공실 처리했습니다.", vacated);
        } else {
            log.info("[출고 자리 정합화] 대상 없음 (이미 정합).");
        }
    }
}
