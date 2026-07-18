package com.example.wms.order.service;

import com.example.wms.order.dto.*;
import com.example.wms.common.validation.TemporalValidator;
import com.example.wms.customer.entity.Customer;
import com.example.wms.customer.exception.BlacklistedCustomerException;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.customer.repository.CustomerRepository;
import com.example.wms.container.entity.Container;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.warehouse.repository.WarehouseRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@Service
@RequiredArgsConstructor
public class StorageOrderService {

    private final StorageOrderRepository storageOrderRepository;
    private final CustomerRepository customerRepository;
    private final WarehouseRepository warehouseRepository;
    private final ContainerRepository containerRepository;

    // 보관 계약 등록
    @Transactional
    public StorageOrderResponse createOrder(StorageOrderCreateRequest request) {
        // [격리] 고객·창고 모두 "내 tenant 소유"여야만 조회됨.
        // 남의 고객/창고 id를 넣으면 여기서 "존재하지 않음"으로 막힌다.
        Long tenantId = SecurityUtils.getCurrentTenantId();

        Customer customer = customerRepository.findByIdAndTenantId(request.getCustomerId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 고객입니다. id=" + request.getCustomerId()));

        // [하드가드] 블랙리스트 고객은 신규 계약 등록 불가 (데이터 오염 원천 차단)
        if (customer.isBlacklisted()) {
            throw new BlacklistedCustomerException(customer.getName());
        }

        // [날짜 정합성] 종료일 >= 시작일 (당일 계약 허용)
        TemporalValidator.validateContractPeriod(request.getStorageStartDate(), request.getExpectedEndDate());

        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(request.getWarehouseId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + request.getWarehouseId()));

        // 고객·창고가 모두 내 tenant 소유이므로 소속은 자동으로 동일하다.
        Tenant tenant = customer.getTenant();

        StorageOrder order = new StorageOrder(
                tenant,
                customer,
                warehouse,
                request.getStorageStartDate(),
                request.getExpectedEndDate(),
                request.getMonthlyFee(),
                request.getTotalVolume(),
                request.getMemo()
        );

        StorageOrder saved = storageOrderRepository.save(order);
        return new StorageOrderResponse(saved);
    }

    @Transactional(readOnly = true)
    public Page<StorageOrderResponse> getOrders(Pageable pageable) {
        Long tenantId = SecurityUtils.getCurrentTenantId();   // [격리]
        return storageOrderRepository.findByTenantId(tenantId, pageable)
                .map(StorageOrderResponse::new);
    }

    @Transactional(readOnly = true)
    public StorageOrderResponse getOrder(Long id) {
        return new StorageOrderResponse(findOrderOrThrow(id));
    }

    @Transactional
    public StorageOrderResponse updateOrder(Long id, StorageOrderUpdateRequest request) {
        StorageOrder order = findOrderOrThrow(id);
        // 시작일이 함께 넘어오면 그 값을, 아니면 기존 시작일을 기준으로 정합성 검증
        LocalDate effectiveStart = request.getStorageStartDate() != null
                ? request.getStorageStartDate() : order.getStorageStartDate();
        // [날짜 정합성] 보관 시작일이 계약 종료일보다 미래가 될 수 없다 (당일 허용)
        TemporalValidator.validateContractPeriod(effectiveStart, request.getExpectedEndDate());
        order.updateInfo(
                request.getStorageStartDate(),
                request.getExpectedEndDate(),
                request.getMonthlyFee(),
                request.getTotalVolume(),
                request.getMemo()
        );
        // [일정 동기화] 이 계약에 배정된 컨테이너의 입고/출고예정일을 계약 기간과 일치시킨다.
        //   (계약이 단일 소스 — 컨테이너 관리·캘린더에서 계약과 어긋나지 않도록)
        syncContainerSchedule(order, order.getStorageStartDate(), order.getExpectedEndDate());
        return new StorageOrderResponse(order);
    }

    @Transactional
    public StorageOrderResponse releaseOrder(Long id, StorageOrderReleaseRequest request) {
        StorageOrder order = findOrderOrThrow(id);
        // [날짜 정합성] 실제 출고일은 보관 시작일보다 빠를 수 없다
        TemporalValidator.validateContractPeriod(order.getStorageStartDate(), request.getActualEndDate());
        order.release(request.getActualEndDate());
        // [일정 동기화] 출고 완료 시 배정 컨테이너의 출고예정일을 실제 출고일로 확정한다.
        syncContainerSchedule(order, order.getStorageStartDate(), request.getActualEndDate());
        return new StorageOrderResponse(order);
    }

    @Transactional
    public StorageOrderResponse unreleaseOrder(Long id) {
        StorageOrder order = findOrderOrThrow(id);
        order.unreleased();
        // [일정 동기화] 출고 취소 시 배정 컨테이너의 출고예정일을 원래 예정일로 복구한다.
        syncContainerSchedule(order, order.getStorageStartDate(), order.getExpectedEndDate());
        return new StorageOrderResponse(order);
    }

    /**
     * [슬롯 지정 시] 상태 자동 전이 (컨테이너 배치 시 호출)
     */
    @Transactional
    public void onSlotAssigned(Long orderId) {
        StorageOrder order = findOrderOrThrow(orderId);
        order.assignSlot();
        // 상태 평가 후 저장됨
    }

    /**
     * [슬롯 해제 시] 상태 자동 전이
     */
    @Transactional
    public void onSlotUnassigned(Long orderId) {
        StorageOrder order = findOrderOrThrow(orderId);
        order.unassignSlot();
        // 상태 평가 후 저장됨
    }

    /**
     * [배치 작업] 모든 활성 계약의 상태를 현재 날짜 기준으로 재평가
     * 매일 자정에 실행되어 시간 기반 상태 전이를 처리
     */
    @Transactional
    public void evaluateAllOrdersStatus() {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        var activeOrders = storageOrderRepository.findByTenantIdAndStatusNotIn(
                tenantId,
                java.util.List.of(OrderStatus.RELEASED, OrderStatus.CANCELLED)
        );
        for (StorageOrder order : activeOrders) {
            order.evaluateStatus();
        }
    }

    /**
     * [일정 동기화] 계약에 배정된 컨테이너들의 입고일/출고예정일을 계약 기간과 맞춘다.
     * 계약↔컨테이너는 currentOrder 로 직접 연결되므로 계약을 단일 소스로 삼아 파생 필드를 갱신한다.
     * (배정된 컨테이너가 없으면 no-op)
     */
    private void syncContainerSchedule(StorageOrder order, LocalDate start, LocalDate end) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        for (Container c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
            c.setStorageDates(start, end);
        }
    }

    @Transactional
    public void deleteOrder(Long id) {
        StorageOrder order = findOrderOrThrow(id);
        storageOrderRepository.delete(order);
    }

    // ===== 내부 헬퍼 =====
    // [격리] id로 찾되 내 tenant 소유일 때만
    private StorageOrder findOrderOrThrow(Long id) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return storageOrderRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 계약입니다. id=" + id));
    }
}