package com.example.wms.order.service;

import com.example.wms.order.dto.*;
import com.example.wms.common.validation.TemporalValidator;
import com.example.wms.customer.entity.Customer;
import com.example.wms.customer.exception.BlacklistedCustomerException;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.customer.repository.CustomerRepository;
import com.example.wms.container.entity.Container;
import com.example.wms.container.repository.ContainerRepository;
import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.SettlementType;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.billing.repository.PaymentHistoryRepository;
import com.example.wms.billing.repository.BillingAdjustmentRepository;
import com.example.wms.billing.service.BillingService;
import com.example.wms.yard.repository.YardSlotRepository;
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
    private final BillingLedgerRepository billingLedgerRepository;
    private final PaymentHistoryRepository paymentHistoryRepository;
    private final BillingAdjustmentRepository billingAdjustmentRepository;
    private final YardSlotRepository yardSlotRepository;
    private final BillingService billingService;

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

        // [선불 자동 정산] 결제 방식이 PREPAID이고 요금이 있으면, 같은 트랜잭션에서
        //   청구 원장 생성 → 발행 → 전액 수금까지 원자적으로 완결한다.
        //   (실패 시 계약까지 함께 롤백 → "계약은 됐는데 청구 실패" 같은 부분 상태가 사라진다)
        if (request.getPaymentType() == SettlementType.PREPAID
                && request.getMonthlyFee() != null && request.getMonthlyFee() > 0) {
            LocalDate periodStart = saved.getStorageStartDate();
            LocalDate periodEnd = saved.getExpectedEndDate() != null
                    ? saved.getExpectedEndDate() : periodStart.plusDays(7);
            billingService.settlePrepaid(saved, periodStart, periodEnd,
                    java.math.BigDecimal.valueOf(request.getMonthlyFee()));
        }

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

    // ===== [상태 토글] 입고 ↔ 출고 단일 전환 =====
    /**
     * 현재 상태의 반대로 토글한다.
     * - 입고 → 출고: 실제 출고일을 오늘로 기록
     * - 출고 → 입고: 출고 정보 초기화
     */
    @Transactional
    public StorageOrderResponse toggleStatus(Long id) {
        StorageOrder order = findOrderOrThrow(id);
        LocalDate today = LocalDate.now();
        if (order.isInbound()) {
            // 입고 → 출고
            TemporalValidator.validateContractPeriod(order.getStorageStartDate(), today);
            order.release(today);
            syncContainerSchedule(order, order.getStorageStartDate(), today);
        } else {
            // 출고 → 입고
            order.unreleased();
            syncContainerSchedule(order, order.getStorageStartDate(), order.getExpectedEndDate());
        }
        return new StorageOrderResponse(order);
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

    // ===== [계약 삭제 - 연쇄 정리] =====
    /**
     * 계약 삭제 시 하위 자원을 모순 없이 연쇄 정리한다 (단일 트랜잭션 — 전부 성공 또는 전부 롤백).
     *
     *  1. 보관창고 슬롯 공석 처리  : 계약에 배정된 컨테이너가 적재된 슬롯을 vacate → 자원(자리) 즉시 해제
     *  2. 컨테이너 삭제           : 계약 등록 시 자동 생성된 물리 단위이므로 유령 데이터로 남기지 않고 제거
     *  3. 청구 원장 연쇄 삭제      : 입금 내역 → 조정 내역 → 원장 순 (FK 역순)
     *  4. 계약 삭제
     */
    @Transactional
    public void deleteOrder(Long id) {
        StorageOrder order = findOrderOrThrow(id);
        Long tenantId = SecurityUtils.getCurrentTenantId();

        // 1~2. 컨테이너: 슬롯 공석 처리 후 삭제 (컨테이너 관리 화면의 '입고' 유령 노출 차단)
        for (Container c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
            yardSlotRepository.findByTenantIdAndContainerId(tenantId, c.getId())
                    .ifPresent(slot -> slot.vacate());
            containerRepository.delete(c);
        }

        // 3. 청구 원장의 하위 데이터(입금·조정)부터 삭제 후 원장 삭제
        for (BillingLedger ledger : billingLedgerRepository.findByStorageOrderId(order.getId())) {
            paymentHistoryRepository.deleteByBillingLedgerId(ledger.getId());
            billingAdjustmentRepository.deleteByBillingLedgerId(ledger.getId());
            billingLedgerRepository.delete(ledger);
        }

        // 4. 계약 삭제
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