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
        LocalDate today = LocalDate.now();
        LocalDate periodStart = order.getStorageStartDate();
        // [출고일 미정 임시 기간] 월 단위(MONTHLY) 청구이므로 임시 기간도 한 달로 잡는다.
        //   예전엔 +7일(어정쩡한 일주일)이라 정산서 화면에 "8/2~8/9"처럼 표시돼 혼동을 줬다.
        LocalDate periodEnd = order.getExpectedEndDate() != null
                ? order.getExpectedEndDate() : periodStart.plusMonths(1).minusDays(1);

        // [과거 계약 등록] 실제 과거 입고일부터 지금 처음 등록하는 계약 — 과거분은 소급 청구하지
        //   않고 0원·완료 원장 1건으로 묶어 남긴 뒤, 오늘부터의 진짜 청구만 새로 시작한다.
        //   이미 과거에 끝난 계약(종료일이 오늘보다 과거)까지 "오늘부터 청구"로 되살리지 않도록,
        //   종료일이 없거나(미정) 오늘 이후일 때만 적용한다.
        boolean bundleHistory = Boolean.TRUE.equals(request.getHistoricalContract())
                && periodStart.isBefore(today)
                && (order.getExpectedEndDate() == null || !order.getExpectedEndDate().isBefore(today));
        LocalDate billingPeriodStart = bundleHistory ? today : periodStart;
        LocalDate billingPeriodEnd = bundleHistory && order.getExpectedEndDate() == null
                ? today.plusMonths(1).minusDays(1)
                : periodEnd;

        com.example.wms.billing.entity.SettlementType payType =
                request.getPaymentType() != null ? request.getPaymentType() : SettlementType.POSTPAID;
        // 납기 기본값: 선불=보관 시작일 / 후불=보관 종료일 (프론트와 동일 규칙, 서버가 이중 방어)
        //   과거 계약 묶음 처리 시엔 '오늘부터의 진짜 원장' 기준(billingPeriod*)으로 잡아야
        //   납기일이 2019년 같은 과거 날짜로 잘못 채워지지 않는다.
        LocalDate due = request.getDueDate() != null ? request.getDueDate()
                : (payType == SettlementType.PREPAID ? billingPeriodStart : billingPeriodEnd);
        order.setPaymentType(payType);
        order.setDueDate(due);

        // [정산서 생성 방식] 미지정 시 자동(true) — 매출 구멍 방지를 위한 서버 안전 기본값. 폼의 초기 선택값(수동)은 항상 명시 전송되어야 한다.
        order.setAutoBillingEnabled(
                request.getAutoBillingEnabled() != null ? request.getAutoBillingEnabled() : true);

        StorageOrder saved = storageOrderRepository.save(order);

        // [청구서 자동 발행] 결제 방식과 무관하게 계약 등록과 동시에 청구 원장을 만든다.
        //   (같은 트랜잭션 — 실패 시 계약까지 롤백되어 "계약은 됐는데 청구 없음" 매출 구멍이 사라진다)
        if (request.getMonthlyFee() != null && request.getMonthlyFee() > 0) {
            java.math.BigDecimal amount = java.math.BigDecimal.valueOf(request.getMonthlyFee());
            if (bundleHistory) {
                // [과거 계약 등록] 입고일~어제까지를 0원·완료 원장 1건으로 묶어 소급 청구를 대신한다.
                billingService.settleHistoricalBundle(saved, periodStart, today.minusDays(1));
            }
            if (payType == SettlementType.PREPAID) {
                // 선불: 원장 생성 → 발행 → 전액 수금(완납, 미납 0원)
                billingService.settlePrepaid(saved, billingPeriodStart, billingPeriodEnd, amount, due, saved.getPaymentMethod());
            } else {
                // 후불: 원장 생성 → 발행(입금예정, 미납=전액)
                billingService.issuePostpaid(saved, billingPeriodStart, billingPeriodEnd, amount, due);
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
        // [출고일 미정 방어] 종료일이 없으면 등록 때(createOrder)와 같은 규칙으로 시작일+1개월을 임시 기준으로 삼는다.
        //   시작일 그대로 쓰면 후불 계약의 납기일이 등록 당일이 되어 장기 계약이 즉시 연체로 보이는 문제가 있었다.
        LocalDate periodEnd = order.getExpectedEndDate() != null
                ? order.getExpectedEndDate() : order.getStorageStartDate().plusMonths(1).minusDays(1);
        LocalDate newDue = request.getDueDate() != null ? request.getDueDate()
                : (newType == SettlementType.PREPAID ? order.getStorageStartDate() : periodEnd);
        order.setPaymentType(newType);
        order.setDueDate(newDue);

        // 4) 정산서 생성 방식(자동/수동) — 미지정 시 기존 값 유지
        if (request.getAutoBillingEnabled() != null) {
            order.setAutoBillingEnabled(request.getAutoBillingEnabled());
        }

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
            // [출고일 범위 제약] 실제 출고일은 보관 시작일 ~ 종료일 이내여야 한다.
            //   당일 여부와 무관 — 중도 출고는 보관기간 안이라면 미래일도 허용(예약 출고). 종료일 이후만 차단.
            if (order.getExpectedEndDate() != null && actualEnd.isAfter(order.getExpectedEndDate())) {
                throw new IllegalArgumentException(
                        "실제 출고일은 보관 종료일 이내여야 합니다. 기간을 늘리려면 계약 수정으로 처리하세요.");
            }
            order.release(actualEnd);
            // [정산 연동] 출고 시 항상 활성 원장을 실제 출고일로 마감·재산정한다.
            //   중도출고면 보관기간 종료일=출고일, 기본청구액=실사용분으로 재계산(정상출고면 no-op).
            //   settledAmount가 오면 그 금액을 실사용 보관료로 사용(관리자 수동 override).
            Integer actualUse = billingService.settleReleaseForOrder(
                    order.getId(), actualEnd, req.getSettledAmount());
            if (actualUse != null) {
                order.applySettledFee(actualUse);   // 계약관리 화면 보관료도 실사용 금액으로
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
            java.util.List<Container> containers =
                    containerRepository.findByTenantIdAndCurrentOrderId(tenantId, order.getId());

            // [모순 방어 - 선검증] 원래 자리가 그 사이 '다른 컨테이너'로 점유됐거나 사라졌으면 출고취소 불가.
            //   상태/정산을 건드리기 전에 먼저 막아, 컨테이너가 자리 없이 떠도는 모순 상태를 원천 차단한다.
            for (Container c : containers) {
                Long sid = c.getReleasedSlotId();
                if (sid == null) continue;
                var slot = yardSlotRepository.findById(sid)
                        .filter(s -> s.getTenant().getId().equals(tenantId))
                        .orElseThrow(() -> new IllegalStateException(
                                "원래 보관 자리를 찾을 수 없어 출고 취소할 수 없습니다. 창고 배치가 변경되었을 수 있습니다."));
                boolean takenByOther = slot.isOccupied()
                        && (slot.getContainer() == null || !slot.getContainer().getId().equals(c.getId()));
                if (takenByOther) {
                    throw new IllegalStateException(
                            "원래 보관 자리(" + slot.getLocationLabel() + ")가 이미 다른 컨테이너로 사용 중이라 출고 취소할 수 없습니다. "
                                    + "해당 자리를 비운 뒤 다시 시도하세요.");
                }
            }

            // 검증 통과 → 정산 취소 → 보관 종료일·보관료 롤백(unreleased) → 컨테이너 원자리 복구
            billingService.reverseMidReleaseForOrder(order.getId());
            order.unreleased();
            for (Container c : containers) {
                Long sid = c.getReleasedSlotId();
                if (sid == null) continue;
                yardSlotRepository.findById(sid)
                        .filter(s -> s.getTenant().getId().equals(tenantId))
                        .ifPresent(slot -> {
                            if (!slot.isOccupied()) slot.place(c);   // 이미 이 컨테이너면 멱등, 아니면 원자리 재적재
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