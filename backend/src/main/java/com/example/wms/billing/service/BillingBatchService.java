package com.example.wms.billing.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import com.example.wms.billing.notification.BillingNotification;
import com.example.wms.billing.notification.BillingNotificationEvent;
import com.example.wms.billing.notification.NotificationType;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.billing.support.ProrationCalculator;
import com.example.wms.order.entity.OrderStatus;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 청구 배치(스케줄러) 전용 서비스.
 *
 * [핵심] 로그인 사용자가 없는 스케줄러 문맥에서 실행되므로
 *   SecurityUtils(테넌트 컨텍스트)에 의존하지 않고, 전 테넌트를 직접 순회한다.
 *   각 원장의 소속은 계약(StorageOrder)이 들고 있는 tenant를 그대로 사용한다.
 */
@Service
@RequiredArgsConstructor
public class BillingBatchService {

    // 청구 대상 = 아직 출고/취소되지 않은 활성 계약
    private static final List<OrderStatus> ACTIVE_STATUSES =
            List.of(OrderStatus.RECEIVED, OrderStatus.IN_STORAGE);

    private final BillingLedgerRepository ledgerRepository;
    private final StorageOrderRepository storageOrderRepository;
    private final ProrationCalculator prorationCalculator;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * 지정 월(targetMonth)의 청구 원장을 활성 계약마다 자동 생성한다.
     * 이미 같은 계약·같은 기간 원장이 있으면 건너뛴다(중복 방지).
     * @return 생성된 원장 수
     */
    @Transactional
    public int generateMonthlyLedgers(YearMonth targetMonth) {
        LocalDate periodStart = targetMonth.atDay(1);
        LocalDate periodEnd = targetMonth.atEndOfMonth();
        LocalDate dueDate = targetMonth.atDay(10);   // 납기: 해당 월 10일

        List<StorageOrder> activeOrders = storageOrderRepository.findByStatusIn(ACTIVE_STATUSES);
        int created = 0;

        for (StorageOrder order : activeOrders) {
            if (ledgerRepository.existsByStorageOrderIdAndBillingPeriodStart(order.getId(), periodStart)) {
                continue;   // 이미 이번 달 원장이 있음
            }
            BigDecimal base = prorationCalculator.prorateMonthly(
                    BigDecimal.valueOf(order.getMonthlyFee()), periodStart, periodEnd);

            BillingLedger ledger = new BillingLedger(
                    order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                    BillingType.MONTHLY, SettlementType.POSTPAID,
                    periodStart, periodEnd, base, MoneyPolicy.ZERO, dueDate);
            ledger.issue(dueDate);   // 자동 생성분은 바로 발행(청구 확정)
            ledgerRepository.save(ledger);
            created++;
        }
        return created;
    }

    /**
     * 전 테넌트의 미납(납기 경과 + 잔액>0) 원장에 미납 촉구 알림 발송.
     * @return 발송 대상 건수
     */
    @Transactional
    public int sendAllOverdueReminders() {
        List<BillingLedger> overdue = ledgerRepository.findAllOverdue(LocalDate.now());
        for (BillingLedger ledger : overdue) {
            BillingNotification notification = new BillingNotification(
                    ledger.getTenant().getId(), ledger.getId(), ledger.getLedgerNo(),
                    NotificationType.OVERDUE_REMINDER,
                    ledger.getCustomer().getName(), ledger.getCustomer().getPhoneNumber(),
                    ledger.getBalance(), ledger.getDueDate());
            eventPublisher.publishEvent(new BillingNotificationEvent(notification));
        }
        return overdue.size();
    }

    private String generateLedgerNo() {
        String datePart = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String ledgerNo;
        do {
            int random = (int) (Math.random() * 10000);
            ledgerNo = String.format("LDG-%s-%04d", datePart, random);
        } while (ledgerRepository.existsByLedgerNo(ledgerNo));
        return ledgerNo;
    }
}
