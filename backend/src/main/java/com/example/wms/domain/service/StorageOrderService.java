package com.example.wms.domain.service;

import com.example.wms.domain.dto.*;
import com.example.wms.domain.entity.Customer;
import com.example.wms.domain.entity.StorageOrder;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.entity.Warehouse;
import com.example.wms.domain.repository.CustomerRepository;
import com.example.wms.domain.repository.StorageOrderRepository;
import com.example.wms.domain.repository.WarehouseRepository;
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
        Customer customer = customerRepository.findById(request.getCustomerId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 고객입니다. id=" + request.getCustomerId()));

        Warehouse warehouse = warehouseRepository.findById(request.getWarehouseId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 창고입니다. id=" + request.getWarehouseId()));

        // 고객과 창고가 같은 업체 소속인지 검증
        Tenant customerTenant = customer.getTenant();
        if (!customerTenant.getId().equals(warehouse.getTenant().getId())) {
            throw new IllegalArgumentException(
                    "고객과 창고의 소속 업체가 다릅니다. 같은 업체의 고객·창고만 계약할 수 있습니다.");
        }

        String orderNumber = generateOrderNumber();

        StorageOrder order = new StorageOrder(
                orderNumber,
                customerTenant,
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
    public Page<StorageOrderResponse> getOrdersByTenant(Long tenantId, Pageable pageable) {
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
    private StorageOrder findOrderOrThrow(Long id) {
        return storageOrderRepository.findById(id)
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