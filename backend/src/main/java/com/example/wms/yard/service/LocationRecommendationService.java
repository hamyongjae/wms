package com.example.wms.yard.service;

import com.example.wms.security.SecurityUtils;
import com.example.wms.yard.dto.YardSlotResponse;
import com.example.wms.yard.entity.StorageTerm;
import com.example.wms.yard.entity.YardSlot;
import com.example.wms.yard.repository.YardSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/**
 * 빈자리(Empty Slot) 추천 엔진 — 지게차 재취급(Shifting) 최소화를 위한 룰 기반.
 *
 * [규칙] 후보는 비어 있는 슬롯. (적재 물리 규칙은 사용하지 않음)
 *  - 단기(SHORT_TERM): 꺼내기 쉬운 상단(tier 높은 쪽) + 앞쪽(row·column 작은 쪽) 우선.
 *  - 장기(LONG_TERM): 하단(tier 낮은 쪽) + 안쪽(row·column 큰 쪽) 우선.
 */
@Service
@RequiredArgsConstructor
public class LocationRecommendationService {

    private final YardSlotRepository yardSlotRepository;

    @Transactional(readOnly = true)
    public YardSlotResponse recommend(Long warehouseId, StorageTerm term) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        List<YardSlot> slots = yardSlotRepository.findByTenantIdAndWarehouseId(tenantId, warehouseId);
        if (slots.isEmpty()) {
            throw new IllegalArgumentException("해당 창고에 등록된 슬롯이 없습니다. 먼저 슬롯을 생성하세요.");
        }

        return slots.stream()
                .filter(s -> !s.isOccupied())
                .min(comparatorFor(term))
                .map(YardSlotResponse::new)
                .orElseThrow(() -> new IllegalArgumentException("추천 가능한 빈 슬롯이 없습니다."));
    }

    private Comparator<YardSlot> comparatorFor(StorageTerm term) {
        if (term == StorageTerm.SHORT_TERM) {
            // 상단 먼저(tier 내림차순), 앞쪽 먼저(row·column 오름차순)
            return Comparator.comparingInt(YardSlot::getTier).reversed()
                    .thenComparingInt(YardSlot::getRowNo)
                    .thenComparingInt(YardSlot::getColumnNo);
        }
        // LONG_TERM: 하단 먼저(tier 오름차순), 안쪽 먼저(row·column 내림차순)
        return Comparator.comparingInt(YardSlot::getTier)
                .thenComparing(Comparator.comparingInt(YardSlot::getRowNo).reversed())
                .thenComparing(Comparator.comparingInt(YardSlot::getColumnNo).reversed());
    }
}
