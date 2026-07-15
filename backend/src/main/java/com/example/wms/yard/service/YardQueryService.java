package com.example.wms.yard.service;

import com.example.wms.security.SecurityUtils;
import com.example.wms.yard.dto.YardSlotResponse;
import com.example.wms.yard.repository.YardSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 야적장 조회 전용 서비스 (슬롯 목록). */
@Service
@RequiredArgsConstructor
public class YardQueryService {

    private final YardSlotRepository yardSlotRepository;

    @Transactional(readOnly = true)
    public Page<YardSlotResponse> listSlots(Long warehouseId, Pageable pageable) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return yardSlotRepository.findByTenantIdAndWarehouseId(tenantId, warehouseId, pageable)
                .map(YardSlotResponse::new);
    }
}
