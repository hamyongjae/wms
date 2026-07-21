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
    private final com.example.wms.user.repository.UserRepository userRepository;

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
                request.getCapacityTons(),   // 보관 용량(톤)
                request.getMemo()
        );

        // [결제 수단] 미지정 시 계좌이체 기본
        order.setPaymentMethod(request.getPaymentMethod() != null
                ? request.getPaymentMethod()
                : com.example.wms.billing.entity.PaymentMethod.BANK_TRANSFER);

        // [수납 담당·계좌 연동] 계좌이체이고 담당 직원이 지정되면 계좌 보유 직원인지 검증 후 연결
        if (order.getPaymentMethod() == com.example.wms.billing.entity.PaymentMethod.BANK_TRANSFER
                && request.getSettlementUserId() != null) {
            com.example.wms.user.entity.User staff = userRepository.findById(request.getSettlementUserId())
                    .filter(u -> u.getTenant() != null && u.getTenant().getId().equals(tenantId))
                    .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 담당 직원입니다."));
            if (!staff.hasAccount()) {
                throw new IllegalArgumentException("담당 직원에게 등록된 수납 계좌가 없습니다. 직원 정보에서 계좌를 먼저 등록하세요.");
            }
            order.setSettlementUser(staff);
        }

        // [청구 조건] 결제 방식(미지정 시 후불)과 납기일을 계약에 영속화 — 수정 시 재정산의 기준이 된다.
        LocalDate periodStart = order.getStorageStartDate();
        LocalDate periodEnd = order.getExpectedEndDate() != null
                ? order.getExpectedEndDate() : periodStart.plusDays(7);
        com.example.wms.billing.entity.SettlementType payType =
                request.getPaymentType() != null ? request.getPaymentType() : SettlementType.POSTPAID;
        // 납기 기본값: 선불=보관 시작일 / 후불=보관 종료일 (프론트와 동일 규칙, 서버가 이중 방어)
        LocalDate due = request.getDueDate() != null ? request.getDueDate()
                : (payType == SettlementType.PREPAID ? periodStart : periodEnd);
        order.setPaymentType(payType);
        order.setDueDate(due);

        StorageOrder saved = storageOrderRepository.save(order);

        // [청구서 자동 발행] 결제 방식과 무관하게 계약 등록과 동시에 청구 원장을 만든다.
        //   (같은 트랜잭션 — 실패 시 계약까지 롤백되어 "계약은 됐는데 청구 없음" 매출 구멍이 사라진다)
        if (request.getMonthlyFee() != null && request.getMonthlyFee() > 0) {
            java.math.BigDecimal amount = java.math.BigDecimal.valueOf(request.getMonthlyFee());
            if (payType == SettlementType.PREPAID) {
                // 선불: 원장 생성 → 발행 → 전액 수금(완납, 미납 0원)
                billingService.settlePrepaid(saved, periodStart, periodEnd, amount, due, saved.getPaymentMethod());
            } else {
                // 후불: 원장 생성 → 발행(입금예정, 미납=전액)
                billingService.issuePostpaid(saved, periodStart, periodEnd, amount, due);
            }
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
                request.getCapacityTons(),
                request.getMemo()
        );

        // ===== [청구 조건 수정] 결제 수단·입금계좌·결제 방식·납기일 — 등록과 동일 로직으로 연동 =====
        Long tenantId = SecurityUtils.getCurrentTenantId();

        // 1) 결제 수단 (미지정 시 기존값 유지)
        if (request.getPaymentMethod() != null) {
            order.setPaymentMethod(request.getPaymentMethod());
        }
        // 2) 입금 계좌(담당 직원) — 계좌이체일 때만 유효. 다른 수단으로 바뀌면 연결 해제.
        if (order.getPaymentMethod() == com.example.wms.billing.entity.PaymentMethod.BANK_TRANSFER) {
            if (request.getSettlementUserId() != null) {
                com.example.wms.user.entity.User staff = userRepository.findById(request.getSettlementUserId())
                        .filter(u -> u.getTenant() != null && u.getTenant().getId().equals(tenantId))
                        .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 담당 직원입니다."));
                if (!staff.hasAccount()) {
                    throw new IllegalArgumentException("담당 직원에게 등록된 수납 계좌가 없습니다. 직원 정보에서 계좌를 먼저 등록하세요.");
                }
                order.setSettlementUser(staff);
            } else {
                order.setSettlementUser(null);
            }
        } else {
            order.setSettlementUser(null);
        }

        // 3) 결제 방식(선불/후불)·납기일 — 계약에 반영하고, 활성 원장을 같은 논리로 재정산
        SettlementType newType = request.getPaymentType() != null
                ? request.getPaymentType() : order.getPaymentType();
        // 납기일: 명시값 우선, 없으면 결제 방식별 기본(선불=시작일/후불=종료일)
        LocalDate periodEnd = order.getExpectedEndDate() != null
                ? order.getExpectedEndDate() : order.getStorageStartDate();
        LocalDate newDue = request.getDueDate() != null ? request.getDueDate()
                : (newType == SettlementType.PREPAID ? order.getStorageStartDate() : periodEnd);
        order.setPaymentType(newType);
        order.setDueDate(newDue);
        // 원장 자동 재정산 (후불→선불 완납 / 선불→후불 수납취소 / 납기 갱신)
        billingService.resettleForOrder(order.getId(), newType, newDue, order.getPaymentMethod());

        // [일정 동기화] 이 계약에 배정된 컨테이너의 입고/출고예정일을 계약 기간과 일치시킨다.
        //   (계약이 단일 소스 — 컨테이너 관리·캘린더에서 계약과 어긋나지 않도록)
        syncContainerSchedule(order, order.getStorageStartDate(), order.getExpectedEndDate());
        return new StorageOrderResponse(order);
    }

    // ===== [입/출고 유형별 처리] 계약 상태 전환 =====
    /**
     * 유형(정상/중도출고·정상/지연입고)에 따라 계약 상태를 전환하고, 필요 시 매출을 소급 정산한다.
     * 상태는 여전히 이진(INBOUND/OUTBOUND) — 정산 원장과의 참조 무결성을 서비스 레이어에서 방어한다.
     */
    @Transactional
    public StorageOrderResponse changeStatus(Long id, StorageOrderStatusChangeRequest req) {
        StorageOrder order = findOrderOrThrow(id);
        Long tenantId = SecurityUtils.getCurrentTenantId();
        // targetStatus 미지정 시 현재의 반대로 판정
        OrderStatus target = req.getTargetStatus() != null
                ? req.getTargetStatus()
                : (order.isInbound() ? OrderStatus.OUTBOUND : OrderStatus.INBOUND);

        LocalDate today = LocalDate.now();
        if (target == OrderStatus.OUTBOUND) {
            // 정상 출고: 예정일(없으면 오늘) / 중도 출고: 입력받은 실제 출고일
            LocalDate actualEnd = req.getActualEndDate() != null
                    ? req.getActualEndDate()
                    : (order.getExpectedEndDate() != null ? order.getExpectedEndDate() : today);
            TemporalValidator.validateContractPeriod(order.getStorageStartDate(), actualEnd);
            // [이중 방어] 실제 출고일은 미래일 수 없다 — '만기 전 정상 출고'(미래 종료일 확정) 모순 차단
            if (actualEnd.isAfter(today)) {
                throw new IllegalArgumentException(
                        "보관 종료일이 아직 도래하지 않아 정상 출고할 수 없습니다. 중도 출고로 처리하세요.");
            }
            order.release(actualEnd);
            // [매출 소급] 중도출고 + 소급 선택 시 원장 정산.
            if (req.isApplySettlement()) {
                if (req.getSettledAmount() != null) {
                    billingService.settleManualForOrder(order.getId(), req.getSettledAmount());
                    order.applySettledFee(req.getSettledAmount().intValue()); // 계약 보관료도 실사용 금액으로
                } else {
                    billingService.settleMidReleaseForOrder(order.getId(), actualEnd);
                }
            }
            // [자원 동기화] 점유하던 슬롯을 즉시 공실 처리 (원자리는 컨테이너에 기억 → 출고취소 복구용)
            for (Container c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
                yardSlotRepository.findByTenantIdAndContainerId(tenantId, c.getId()).ifPresent(slot -> {
                    c.markReleasedFromSlot(slot.getId());
                    slot.vacate();
                });
            }
            // 배정 컨테이너 출고예정일도 실제 출고일로 확정
            syncContainerSchedule(order, order.getStorageStartDate(), actualEnd);
        } else {
            // ===== [출고 취소] 마감 전 상태로 소급 복구 =====
            // 정산 취소 → 보관 종료일·보관료 롤백(unreleased) → 컨테이너 원자리 복구
            billingService.reverseMidReleaseForOrder(order.getId());
            order.unreleased();
            for (Container c : containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId())) {
                Long sid = c.getReleasedSlotId();
                if (sid == null) continue;
                yardSlotRepository.findById(sid)
                        .filter(s -> s.getTenant().getId().equals(tenantId) && !s.isOccupied())
                        .ifPresent(slot -> {
                            slot.place(c);        // 원자리 재적재
                            c.restoredToSlot();
                        });
            }
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