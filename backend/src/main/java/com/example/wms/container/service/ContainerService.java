package com.example.wms.container.service;

import com.example.wms.container.dto.*;
import com.example.wms.common.validation.TemporalValidator;
import com.example.wms.container.entity.Container;
import com.example.wms.container.entity.ContainerStatus;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.security.SecurityUtils;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.warehouse.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 컨테이너 관리 서비스.
 *
 * [격리] 모든 조회·검증은 현재 tenantId로 강제.
 * [동시성] 배정/회수/상태변경은 비관적 락(findForUpdate)으로 이중 배정 방지.
 */
@Service
@RequiredArgsConstructor
public class ContainerService {

    private final ContainerRepository containerRepository;
    private final WarehouseRepository warehouseRepository;
    private final StorageOrderRepository storageOrderRepository;

    // memo 앞머리의 [화주·규격·소유] 태그를 파싱하기 위한 패턴
    private static final Pattern OWNER_TAG = Pattern.compile("^\\[([^\\]]+)\\]");

    // ===== 등록 =====
    @Transactional
    public ContainerResponse createContainer(ContainerCreateRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(req.getWarehouseId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + req.getWarehouseId()));

        if (containerRepository.existsByTenantIdAndContainerNo(tenantId, req.getContainerNo())) {
            throw new IllegalArgumentException("이미 존재하는 컨테이너 번호입니다: " + req.getContainerNo());
        }

        // [날짜 정합성] 실제 입고일은 미래 불가 + 출고예정일은 입고일보다 과거 불가
        TemporalValidator.validateInboundNotFuture(req.getInboundDate());
        TemporalValidator.validateOutboundAfterInbound(req.getInboundDate(), req.getExpectedOutboundDate());

        Container container = new Container(
                warehouse.getTenant(), warehouse, req.getContainerNo(),
                req.getCapacityTon(), req.getMemo());
        container.setStorageDates(req.getInboundDate(), req.getExpectedOutboundDate());

        return new ContainerResponse(containerRepository.save(container));
    }

    // ===== 목록 (창고·상태 필터) =====
    @Transactional(readOnly = true)
    public Page<ContainerResponse> listContainers(Long warehouseId, ContainerStatus status, Pageable pageable) {
        Long tenantId = SecurityUtils.getCurrentTenantId();

        Page<Container> page;
        if (warehouseId != null && status != null) {
            page = containerRepository.findByTenantIdAndWarehouseIdAndStatus(tenantId, warehouseId, status, pageable);
        } else if (warehouseId != null) {
            page = containerRepository.findByTenantIdAndWarehouseId(tenantId, warehouseId, pageable);
        } else if (status != null) {
            page = containerRepository.findByTenantIdAndStatus(tenantId, status, pageable);
        } else {
            page = containerRepository.findByTenantId(tenantId, pageable);
        }
        return page.map(ContainerResponse::new);
    }

    // ===== 단건 조회 =====
    @Transactional(readOnly = true)
    public ContainerResponse getContainer(Long id) {
        return new ContainerResponse(findOrThrow(id));
    }

    // ===== [화주명 검색] 창고 내에서 화주명이 일치하는 컨테이너 id 목록 =====
    // 프론트가 넘긴 고객명(화주명) 질의를 tenant 격리 하에 검증·매칭하여, 하이라이트 대상 id 집합을 돌려준다.
    @Transactional(readOnly = true)
    public List<Long> searchContainerIdsByOwner(Long warehouseId, String ownerName) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        List<Long> matched = new ArrayList<>();
        if (ownerName == null || ownerName.isBlank()) {
            return matched; // 빈 질의 → 매칭 없음(하이라이트 해제)
        }
        // [격리] 요청 창고가 내 tenant 소유인지 확인 (남의 창고 id 차단)
        warehouseRepository.findByIdAndTenantId(warehouseId, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 창고입니다. id=" + warehouseId));

        String needle = ownerName.trim().toLowerCase();
        for (Container c : containerRepository.findAllByTenantIdAndWarehouseId(tenantId, warehouseId)) {
            String owner = ownerFromMemo(c.getMemo());
            if (owner != null && owner.toLowerCase().contains(needle)) {
                matched.add(c.getId());
            }
        }
        return matched;
    }

    /** memo 앞 [화주·규격·소유] 태그에서 화주명만 추출 (규격/소유 토큰 제외). 없으면 null. */
    private String ownerFromMemo(String memo) {
        if (memo == null) return null;
        Matcher m = OWNER_TAG.matcher(memo);
        if (!m.find()) return null;
        List<String> keep = new ArrayList<>();
        for (String token : m.group(1).split("·")) {
            String t = token.trim();
            if (t.isEmpty() || t.matches("(?i)\\d+ft") || t.equals("자가") || t.equals("임차")) {
                continue;
            }
            keep.add(t);
        }
        return keep.isEmpty() ? null : String.join(" · ", keep);
    }

    // ===== 기본 정보 수정 =====
    @Transactional
    public ContainerResponse updateContainer(Long id, ContainerUpdateRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Container container = findOrThrow(id);

        // 번호를 바꾸는 경우에만 중복 검사
        if (!container.getContainerNo().equals(req.getContainerNo())
                && containerRepository.existsByTenantIdAndContainerNo(tenantId, req.getContainerNo())) {
            throw new IllegalArgumentException("이미 존재하는 컨테이너 번호입니다: " + req.getContainerNo());
        }
        // [날짜 정합성] 수정 시에도 입고 미래 불가 + 출고 >= 입고
        TemporalValidator.validateInboundNotFuture(req.getInboundDate());
        TemporalValidator.validateOutboundAfterInbound(req.getInboundDate(), req.getExpectedOutboundDate());

        container.updateInfo(req.getContainerNo(), req.getCapacityTon(), req.getMemo());
        container.setStorageDates(req.getInboundDate(), req.getExpectedOutboundDate());
        return new ContainerResponse(container);
    }

    // ===== 계약 배정 (빈 → 사용중) =====
    @Transactional
    public ContainerResponse assignToOrder(Long id, ContainerAssignRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Container container = lockOrThrow(id);

        StorageOrder order = storageOrderRepository.findByIdAndTenantId(req.getOrderId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 계약입니다. id=" + req.getOrderId()));

        container.assignTo(order);   // 빈 컨테이너 아니면 IllegalState → 409
        // [일정 동기화] 배정과 동시에 컨테이너 입고/출고예정일을 계약 기간으로 상속한다.
        //   (계약이 단일 소스 — 이후 계약 수정 시엔 StorageOrderService가 전파)
        container.setStorageDates(order.getStorageStartDate(), order.getExpectedEndDate());
        return new ContainerResponse(container);
    }

    // ===== 계약 회수 (사용중 → 빈) =====
    @Transactional
    public ContainerResponse releaseContainer(Long id) {
        Container container = lockOrThrow(id);
        container.release();
        return new ContainerResponse(container);
    }

    // ===== 상태 변경 (점검/폐기/복귀) =====
    @Transactional
    public ContainerResponse changeStatus(Long id, ContainerStatusUpdateRequest req) {
        Container container = lockOrThrow(id);
        container.changeStatus(req.getStatus());
        return new ContainerResponse(container);
    }

    // ===== 삭제 =====
    @Transactional
    public void deleteContainer(Long id) {
        Container container = findOrThrow(id);
        if (container.getStatus() == ContainerStatus.OCCUPIED) {
            throw new IllegalStateException("사용 중인 컨테이너는 삭제할 수 없습니다. 먼저 회수하세요.");
        }
        containerRepository.delete(container);
    }

    // ===== 내부 헬퍼 =====
    private Container findOrThrow(Long id) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return containerRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 컨테이너입니다. id=" + id));
    }

    private Container lockOrThrow(Long id) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return containerRepository.findForUpdate(id, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 컨테이너입니다. id=" + id));
    }
}
