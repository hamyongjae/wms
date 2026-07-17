package com.example.wms.yard.service;

import com.example.wms.container.entity.Container;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.warehouse.repository.WarehouseRepository;
import com.example.wms.security.SecurityUtils;
import com.example.wms.yard.dto.*;
import com.example.wms.yard.entity.YardSlot;
import com.example.wms.yard.repository.YardSlotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 야적장 입고/이동/반출 처리 + 슬롯 등록.
 *
 * [규칙] 한 슬롯에는 한 대만(중복 방지) — YardSlot.place()가 LocationFullException으로 강제.
 *   (중력·최대 단수 같은 적재 물리 규칙과 이동 이력은 사용하지 않음)
 * [동시성] 슬롯·컨테이너를 비관적 락(findForUpdate)으로 잠근 뒤 상태 변경.
 *   이동 시 두 슬롯은 id 오름차순으로 잠가 데드락을 피한다.
 */
@Service
@RequiredArgsConstructor
public class YardOperationService {

    private final YardSlotRepository yardSlotRepository;
    private final ContainerRepository containerRepository;
    private final WarehouseRepository warehouseRepository;

    // ===================== 슬롯 등록 =====================

    /** 슬롯 1칸 등록 */
    @Transactional
    public YardSlotResponse createSlot(SlotCreateRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(req.getWarehouseId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + req.getWarehouseId()));

        if (yardSlotRepository.existsByTenantIdAndWarehouseIdAndBlockAndRowNoAndColumnNoAndTier(
                tenantId, warehouse.getId(), req.getBlock(), req.getRowNo(), req.getColumnNo(), req.getTier())) {
            throw new IllegalArgumentException("이미 존재하는 슬롯 좌표입니다.");
        }
        YardSlot slot = new YardSlot(warehouse.getTenant(), warehouse,
                req.getBlock(), req.getRowNo(), req.getColumnNo(), req.getTier());
        return new YardSlotResponse(yardSlotRepository.save(slot));
    }

    /** 격자 일괄 생성 (block에 대해 row×column×tier 슬롯 생성, 이미 있으면 건너뜀) */
    @Transactional
    public int generateGrid(GridGenerateRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(req.getWarehouseId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + req.getWarehouseId()));

        int created = 0;
        for (int r = 1; r <= req.getRows(); r++) {
            for (int c = 1; c <= req.getColumns(); c++) {
                for (int t = 1; t <= req.getTiers(); t++) {
                    if (yardSlotRepository.existsByTenantIdAndWarehouseIdAndBlockAndRowNoAndColumnNoAndTier(
                            tenantId, warehouse.getId(), req.getBlock(), r, c, t)) {
                        continue;
                    }
                    yardSlotRepository.save(new YardSlot(
                            warehouse.getTenant(), warehouse, req.getBlock(), r, c, t));
                    created++;
                }
            }
        }
        return created;
    }

    // ===================== 입고 / 이동 / 반출 =====================

    /** 반입: 야적장 밖의 컨테이너를 대상 슬롯에 적재 */
    @Transactional
    public YardSlotResponse inbound(InboundRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        Container container = containerRepository.findForUpdate(req.getContainerId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 컨테이너입니다. id=" + req.getContainerId()));

        // 이미 야적장에 적재돼 있으면 반입이 아니라 이동을 써야 함
        yardSlotRepository.findByTenantIdAndContainerId(tenantId, container.getId())
                .ifPresent(s -> {
                    throw new IllegalStateException(
                            "이미 적재된 컨테이너입니다(" + s.getLocationLabel() + "). 이동(move)을 사용하세요.");
                });

        YardSlot target = lockSlot(req.getTargetSlotId(), tenantId);
        target.place(container);   // 이미 차 있으면 LocationFullException → 409
        container.markPlacedInYard();   // 가용 → 사용중
        return new YardSlotResponse(target);
    }

    /** 이동: 컨테이너를 현재 슬롯에서 대상 슬롯으로 옮김 */
    @Transactional
    public YardSlotResponse move(MoveRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        Container container = containerRepository.findForUpdate(req.getContainerId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 컨테이너입니다. id=" + req.getContainerId()));

        YardSlot current = yardSlotRepository.findByTenantIdAndContainerId(tenantId, container.getId())
                .orElseThrow(() -> new IllegalStateException(
                        "적재된 적 없는 컨테이너입니다. 먼저 반입(inbound)하세요."));

        if (current.getId().equals(req.getTargetSlotId())) {
            throw new IllegalArgumentException("이미 해당 위치에 있는 컨테이너입니다.");
        }

        // [동시성] 두 슬롯을 id 오름차순으로 잠가 데드락 회피
        YardSlot from;
        YardSlot target;
        if (current.getId() < req.getTargetSlotId()) {
            from = lockSlot(current.getId(), tenantId);
            target = lockSlot(req.getTargetSlotId(), tenantId);
        } else {
            target = lockSlot(req.getTargetSlotId(), tenantId);
            from = lockSlot(current.getId(), tenantId);
        }

        from.vacate();
        target.place(container);   // 대상이 차 있으면 LocationFullException → 409
        container.markPlacedInYard();   // 안전상 사용중 유지
        return new YardSlotResponse(target);
    }

    /** 반출: 컨테이너를 야적장 밖으로 (슬롯 비움) */
    @Transactional
    public YardSlotResponse outbound(OutboundRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        Container container = containerRepository.findForUpdate(req.getContainerId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 컨테이너입니다. id=" + req.getContainerId()));

        YardSlot current = yardSlotRepository.findByTenantIdAndContainerId(tenantId, container.getId())
                .orElseThrow(() -> new IllegalStateException("적재된 적 없는 컨테이너입니다."));

        YardSlot from = lockSlot(current.getId(), tenantId);
        from.vacate();
        container.markRemovedFromYard();   // 사용중 → 가용
        return new YardSlotResponse(from);
    }

    // ===================== 내부 =====================

    private YardSlot lockSlot(Long slotId, Long tena