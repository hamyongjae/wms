package com.example.wms.domain.service;

import com.example.wms.domain.dto.*;
import com.example.wms.domain.entity.Customer;
import com.example.wms.domain.entity.StorageOrder;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.entity.Warehouse;
import com.example.wms.domain.repository.CustomerRepository;
import com.example.wms.domain.repository.StorageOrderRepository;
import com.example.wms.domain.repository.WarehouseRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

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

        Warehouse warehouse = warehouseRepository.findByIdAndTenantId(request.getWarehouseId(), tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + request.getWarehouseId()));

        // 고객·창고가 모두 내 tenant 소유이므로 소속은 자동으로 동일하다.
        Tenant tenant = customer.getTenant();

        String orderNumber = generateOrderNumber();

        StorageOrder order = new StorageOrder(
                orderNumber,
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
        order.updateInfo(
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

    private String generateOrderNumber() {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String orderNumber;
        do {
            int random = (int) (Math.random() * 10000);
            orderNumber = String.format("ORD-%s-%04d", datePart, random);
        } while (storageOrderRepository.existsByOrderNumber(orderNumber));
        return orderNumber;
    }
}