package com.example.wms.container.service;

import com.example.wms.container.dto.*;
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
