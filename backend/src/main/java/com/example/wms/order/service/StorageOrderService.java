package com.example.wms.order.service;

import com.example.wms.order.dto.*;
import com.example.wms.common.validation.TemporalValidator;
import com.example.wms.customer.entity.Customer;
import com.example.wms.customer.exception.BlacklistedCustomerException;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.customer.repository.CustomerRepository;
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
        return new StorageOrderResponse(order);
    }

    @Transactional
    public StorageOrderResponse releaseOrder(Long id, StorageOrderReleaseRequest request) {
        StorageOrder order = findOrderOrThrow(id);
        // [날짜 정합성] 실제 출고일은 보관 시작일보다 빠를 수 없다
        TemporalValidator.validateContractPeriod(order.getStorageStartDate(), request.getActualEndDate());
        order.release(request.getActualEndDate());
        return new StorageOrderResponse(order);
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