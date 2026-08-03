package com.example.wms.billing.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.billing.support.MoneyPolicy;
import com.example.wms.billing.support.ProrationCalculator;
import com.example.wms.order.entity.StorageOrder;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * ===== [배치 전용 — 계약 하나·회차 하나를 독립 트랜잭션으로 발행] =====
 *
 * Hibernate 는 Session(=한 트랜잭션)을 열 때 {@link com.example.wms.security.tenant.WmsTenantIdentifierResolver}
 * 에게 테넌트가 누구인지 딱 한 번만 묻고, 그 세션이 살아있는 동안은 절대 다시 묻지 않는다
 * ({@code validateExistingCurrentSessions() == false}). 그래서 청구 배치처럼 "여러 테넌트를 순회하며
 * 저장"하는 로직을 하나의 {@code @Transactional} 메서드 루프 안에 넣으면, 두 번째 테넌트부터는
 * {@link com.example.wms.security.tenant.TenantContext#runAs} override가 조용히 무시되고
 * {@code tenant_id} FK 위반으로 저장이 실패한다.
 *
 * [해결 원리] 이 메서드를 {@code @Transactional(REQUIRES_NEW)}로 분리하고, <b>호출부는 이미 활성
 * 트랜잭션이 없는 문맥</b>(예: {@code @Scheduled} 메서드처럼 그 자체가 트랜잭션이 아닌 진입점)에서만
 * 호출한다. 이러면 REQUIRES_NEW가 "억제할 기존 트랜잭션" 자체가 없으므로 매번 완전히 새로운
 * 최상위 트랜잭션(=새 세션)으로 시작하고 곧바로 커밋·종료된다 — 중첩(suspend/resume)이 전혀
 * 일어나지 않아, 이전에 REQUIRES_NEW를 이미 활성 트랜잭션 안에서(예: 테스트의 클래스 레벨
 * {@code @Transactional} 안에서) 호출했을 때 발생했던 "재개된 바깥 트랜잭션의 세션이 오염되는"
 * 문제가 원천적으로 생기지 않는다.
 *
 * [호출 규약 — 반드시 지킬 것]
 * 1. 호출부는 {@code TenantContext.runAs(tenantId, () -> issuer.issueIfNotOverlapping(...))} 형태로
 *    "호출을 감싸야" 한다. override는 이 메서드의 {@code @Transactional} 프록시가 트랜잭션을 열기
 *    "전"에 이미 걸려 있어야 하기 때문이다(메서드 본문 안에서 걸면 이미 세션이 열린 뒤라 늦는다).
 * 2. 이 메서드를 호출하는 상위 메서드({@code BillingBatchService.generateDueLedgers} 등)는
 *    {@code @Transactional}이면 안 된다 — 그러면 다시 "이미 활성인 트랜잭션을 suspend"하는
 *    상황이 되어 문제가 재발한다.
 */
@Component
@RequiredArgsConstructor
public class BillingLedgerIssuer {

    private final BillingLedgerRepository ledgerRepository;
    private final ProrationCalculator prorationCalculator;

    /**
     * 계약(order)의 [periodStart, periodEnd] 회차 원장을 발행한다. 같은 계약·기간과 겹치는
     * 원장이 이미 있으면(정상 흐름에선 발생하지 않는 안전망) 아무것도 하지 않고 false를 반환한다.
     *
     * @return 실제로 발행했으면 true, 이미 겹치는 원장이 있어 건너뛰었으면 false
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean issueIfNotOverlapping(StorageOrder order, LocalDate periodStart, LocalDate periodEnd, LocalDate dueDate) {
        if (ledgerRepository.existsActiveLedgerOverlapping(order.getId(), periodStart, periodEnd)) {
            return false;
        }
        BigDecimal base = prorationCalculator.prorateMonthly(
                BigDecimal.valueOf(order.getMonthlyFee()), periodStart, periodEnd);

        BillingLedger ledger = new BillingLedger(
                order.getTenant(), order, order.getCustomer(), generateLedgerNo(),
                BillingType.MONTHLY, SettlementType.POSTPAID,
                periodStart, periodEnd, base, MoneyPolicy.ZERO, dueDate);
        ledger.issue(dueDate);
        ledgerRepository.save(ledger);
        return true;
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
