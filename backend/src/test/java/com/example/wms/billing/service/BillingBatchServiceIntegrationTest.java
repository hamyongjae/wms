package com.example.wms.billing.service;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.support.IntegrationTestBase;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ===== [롤링 청구 배치 회귀 테스트] =====
 *
 * "매달 1일 일괄 생성"에서 "계약별 직전 원장 종료일 다음날부터 이어지는 롤링 주기"로 바꾼
 * {@link BillingBatchService#generateDueLedgers(LocalDate)}를 검증한다.
 * 시나리오 6은 전환 계기가 된 실제 매출 구멍 버그(달력월 배치가 롤링 기간과 겹침 판정으로
 * 충돌해 중간 구간이 영구히 누락되던 문제)가 재발하지 않는지 직접 확인한다.
 *
 * [트랜잭션 경계 — {@code @Transactional(NOT_SUPPORTED)}인 이유]
 * {@code BillingBatchService.generateDueLedgers}는 여러 테넌트를 순회하며
 * {@code BillingLedgerIssuer#issueIfNotOverlapping}(REQUIRES_NEW)를 반복 호출하는데, 이게
 * 안전하려면 "호출부가 이미 활성 트랜잭션 안이 아니어야" 한다(REQUIRES_NEW가 기존 트랜잭션을
 * suspend/resume하는 과정에서 세션이 오염되는 문제가 실제로 재현됨 — 프로덕션에서는 스케줄러
 * 진입점 자체가 트랜잭션이 아니라 문제없다). {@code IntegrationTestBase}는 기본적으로 테스트
 * 메서드 전체를 하나의 트랜잭션으로 감싸 롤백하는데, 그 안에서 이 배치를 호출하면 프로덕션과
 * 다른(트랜잭션이 이미 활성인) 조건이 되어 버그가 재현되지도, 제대로 검증되지도 않는다. 그래서
 * 이 테스트 클래스는 클래스 레벨 {@code @Transactional}을 {@code NOT_SUPPORTED}로 오버라이드해
 * 프로덕션과 동일하게 "트랜잭션 없는 최상위 호출" 조건을 재현한다.
 *
 * [데이터 정리] 위 이유로 각 테스트가 만든 데이터는 롤백되지 않고 실제로 커밋된다. 이 저장소의
 * 테스트 스타일은 항상 특정 id로 결과를 조회해 검증하므로("전체 개수" 같은 비-스코프 단정은 쓰지
 * 않음) 다른 테스트가 남긴 데이터와 섞여도 검증에 영향이 없다 — 그래서 별도 cleanup을 두지 않는다
 * (컨테이너 자체는 전체 테스트 실행 종료 시 폐기됨).
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class BillingBatchServiceIntegrationTest extends IntegrationTestBase {

    @Autowired
    private BillingBatchService billingBatchService;

    @Test
    @DisplayName("직전 원장 종료일 다음날이 기준일 이하면 정확히 다음 1개월 회차를 생성한다")
    void generatesNextPeriodWhenDue() {
        StorageOrder order = seedOrderWithInitialLedger();

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 15));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(2);
        BillingLedger next = ledgers.get(1);
        assertThat(next.getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(next.getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 10, 14));
        // anchorDay 기본값 10일 — 회차 시작일(9/15)보다 이르므로 다음 달(10/10)로 굴러감
        assertThat(next.getDueDate()).isEqualTo(LocalDate.of(2026, 10, 10));
    }

    @Test
    @DisplayName("다음 회차 시작일이 기준일보다 미래면 생성하지 않는다")
    void skipsWhenNotYetDue() {
        StorageOrder order = seedOrderWithInitialLedger();

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 14));

        assertThat(ledgersSortedByPeriodStart(order)).hasSize(1);
    }

    @Test
    @DisplayName("장기 다운타임 후 밀린 회차를 gap·overlap 없이 한 번에 캐치업 생성한다")
    void catchesUpMultiplePeriodsInOneRun() {
        StorageOrder order = seedOrderWithInitialLedger();

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 11, 20));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(4);
        assertContinuous(ledgers);
        assertThat(ledgers.get(3).getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 11, 15));
        assertThat(ledgers.get(3).getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 12, 14));
        // 12/15 회차는 아직 미도래(기준일 11/20) — 생성되지 않아야 함
        assertThat(ledgers).noneMatch(l -> l.getBillingPeriodStart().equals(LocalDate.of(2026, 12, 15)));
    }

    @Test
    @DisplayName("원장이 하나도 없는 계약은 즉석 생성하지 않고 건너뛴다(backfill에 위임)")
    void skipsOrderWithoutAnyLedger() {
        Tenant tenant = createTenant("무원장업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 15), null, 100_000);

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 12, 1));

        assertThat(billingLedgerRepository.findByStorageOrderId(order.getId())).isEmpty();
    }

    @Test
    @DisplayName("monthlyFee가 결손(0 이하)이면 건너뛰고, 복구되면 밀린 회차를 소급 생성한다(데이터 유실 없음)")
    void skipsWhenFeeMissingThenCatchesUpAfterRecovery() {
        StorageOrder order = seedOrderWithInitialLedger();

        // monthly_fee 컬럼 자체가 NOT NULL이라 결손 상태는 0 이하로 표현한다(생성 폼에서도 0은 무효 처리).
        order.setMonthlyFee(0);
        storageOrderRepository.save(order);
        billingBatchService.generateDueLedgers(LocalDate.of(2026, 10, 1));
        assertThat(ledgersSortedByPeriodStart(order)).hasSize(1);

        order.setMonthlyFee(100_000);
        storageOrderRepository.save(order);
        billingBatchService.generateDueLedgers(LocalDate.of(2026, 10, 1));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(2);
        assertThat(ledgers.get(1).getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(ledgers.get(1).getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 10, 14));
    }

    @Test
    @DisplayName("[회귀] 월중 시작 계약을 연속 배치해도 청구 구간에 구멍이 생기지 않는다")
    void neverLeavesGapForMidMonthStartContract() {
        StorageOrder order = seedOrderWithInitialLedger(); // 8/15 시작 → 최초 원장 [8/15~9/14]

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 15));
        billingBatchService.generateDueLedgers(LocalDate.of(2026, 10, 15));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(3);
        assertThat(ledgers.get(0).getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 8, 15));
        assertContinuous(ledgers);
        // 문제가 됐던 실제 구간(9/15~9/30)이 어느 원장 안에 반드시 포함돼 있어야 한다
        LocalDate previouslyMissingDay = LocalDate.of(2026, 9, 20);
        assertThat(ledgers).anyMatch(l ->
                !l.getBillingPeriodStart().isAfter(previouslyMissingDay)
                        && !l.getBillingPeriodEnd().isBefore(previouslyMissingDay));
    }

    @Test
    @DisplayName("같은 기준일로 반복 실행해도 중복 생성되지 않는다(멱등)")
    void idempotentForSameAsOfDate() {
        StorageOrder order = seedOrderWithInitialLedger();
        LocalDate asOf = LocalDate.of(2026, 9, 15);

        billingBatchService.generateDueLedgers(asOf);
        billingBatchService.generateDueLedgers(asOf);

        assertThat(ledgersSortedByPeriodStart(order)).hasSize(2);
    }

    @Test
    @DisplayName("[회귀] 서로 다른 두 업체 계약을 같은 실행에서 순회해도 둘 다 정상 발행된다(테넌트 세션 캐싱 버그 재발 방지)")
    void generatesForMultipleTenantsInSameRun() {
        Tenant tenantA = createTenant("A업체-배치");
        Warehouse warehouseA = createWarehouse(tenantA);
        Customer customerA = createCustomer(tenantA);
        StorageOrder orderA = createOrder(tenantA, customerA, warehouseA,
                LocalDate.of(2026, 8, 15), null, 100_000);
        createLedger(tenantA, orderA, customerA,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 14), new BigDecimal("100000.00"));

        Tenant tenantB = createTenant("B업체-배치");
        Warehouse warehouseB = createWarehouse(tenantB);
        Customer customerB = createCustomer(tenantB);
        StorageOrder orderB = createOrder(tenantB, customerB, warehouseB,
                LocalDate.of(2026, 8, 20), null, 200_000);
        createLedger(tenantB, orderB, customerB,
                LocalDate.of(2026, 8, 20), LocalDate.of(2026, 9, 19), new BigDecimal("200000.00"));

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 20));

        // 두 계약 모두(순서와 무관하게) 두 번째 회차가 정확히 그 계약의 tenant로 발행돼야 한다
        List<BillingLedger> ledgersA = ledgersSortedByPeriodStart(orderA);
        assertThat(ledgersA).hasSize(2);
        assertThat(ledgersA.get(1).getTenant().getId()).isEqualTo(tenantA.getId());

        List<BillingLedger> ledgersB = ledgersSortedByPeriodStart(orderB);
        assertThat(ledgersB).hasSize(2);
        assertThat(ledgersB.get(1).getTenant().getId()).isEqualTo(tenantB.getId());
    }

    @Test
    @DisplayName("[회귀] 출고예정일이 이미 정해진 계약은 회차 청구 때마다 그 종료일로 자동 연장된다("
            + "안 그러면 실제론 정상 진행 중인데 옛 출고예정일 기준으로 '출고 지연'이 잘못 뜬다)")
    void extendsExpectedEndDateWhenAlreadySet() {
        Tenant tenant = createTenant("연장테스트업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        // 출고예정일을 최초 원장 종료일과 똑같이 맞춰서 시작 — "이미 날짜가 정해져 있던" 상태를 재현
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 14), 100_000);
        createLedger(tenant, order, customer,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 14), new BigDecimal("100000.00"));

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 15));

        StorageOrder refreshed = storageOrderRepository.findById(order.getId()).orElseThrow();
        assertThat(refreshed.getExpectedEndDate()).isEqualTo(LocalDate.of(2026, 10, 14));
    }

    @Test
    @DisplayName("[신규] 예정 출고일이 다음 회차 중간에 있으면 한 달을 다 채우지 않고 그 날짜까지만 마지막 회차를 생성한다")
    void clampsFinalRoundToExpectedEndDate() {
        Tenant tenant = createTenant("임박출고업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        // 두 번째 회차(9/15~) 중간인 9/20에 출고 예정 — 한 달(10/14)을 다 채우면 안 된다
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 20), 100_000);
        createLedger(tenant, order, customer,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 14), new BigDecimal("100000.00"));

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 15));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(2);
        BillingLedger last = ledgers.get(1);
        assertThat(last.getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(last.getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 9, 20));
        // 짧은 마지막 회차는 "매달 N일" 납기 패턴 대신 회차 종료일을 그대로 납기일로 쓴다
        assertThat(last.getDueDate()).isEqualTo(LocalDate.of(2026, 9, 20));
        // 종료일이 예정일과 정확히 같으므로 연장 로직(extendOrderPeriod)이 개입하지 않는다
        StorageOrder refreshed = storageOrderRepository.findById(order.getId()).orElseThrow();
        assertThat(refreshed.getExpectedEndDate()).isEqualTo(LocalDate.of(2026, 9, 20));
    }

    @Test
    @DisplayName("[신규] 예정 출고일이 이미 지났는데(출고 지연) 아직 미출고면 축소하지 않고 꽉 찬 한 달을 계속 생성한다")
    void doesNotClampWhenExpectedEndDateAlreadyPassed() {
        Tenant tenant = createTenant("출고지연업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        // 예정 출고일(8/20)이 이미 다음 회차 시작일(9/15)보다 훨씬 과거 — 출고가 늦어지는 상황 재현
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 8, 20), 100_000);
        createLedger(tenant, order, customer,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 14), new BigDecimal("100000.00"));

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 15));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(2);
        assertThat(ledgers.get(1).getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 10, 14));
        StorageOrder refreshed = storageOrderRepository.findById(order.getId()).orElseThrow();
        assertThat(refreshed.getExpectedEndDate()).isEqualTo(LocalDate.of(2026, 10, 14));
    }

    @Test
    @DisplayName("[신규] 정산서 생성 주기를 2개월로 설정하면 회차도 2개월 단위로 생성된다")
    void generatesLedgersUsingConfiguredCycleMonths() {
        StorageOrder order = seedOrderWithInitialLedger(); // 최초 원장 [8/15~9/14](1개월) — 이후부터 주기 변경 적용
        order.setBillingCycleMonths(2);
        storageOrderRepository.save(order);

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 9, 15));

        List<BillingLedger> ledgers = ledgersSortedByPeriodStart(order);
        assertThat(ledgers).hasSize(2);
        BillingLedger next = ledgers.get(1);
        assertThat(next.getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 9, 15));
        assertThat(next.getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 11, 14));
    }

    @Test
    @DisplayName("[회귀] 출고일 미정(null) 장기 계약은 회차 청구가 계속돼도 출고예정일이 임의로 채워지지 않는다")
    void preservesNullExpectedEndDateForIndefiniteContracts() {
        StorageOrder order = seedOrderWithInitialLedger(); // expectedEndDate=null(미정)로 생성됨

        billingBatchService.generateDueLedgers(LocalDate.of(2026, 11, 20)); // 3회차 캐치업

        StorageOrder refreshed = storageOrderRepository.findById(order.getId()).orElseThrow();
        assertThat(refreshed.getExpectedEndDate()).isNull();
    }

    @Test
    @DisplayName("[신규] 완전한 롤링 개월수인데 예전 방식으로 어중간하게 청구된 미납 원장을 새 규칙값으로 정정한다")
    void recalcsLegacyProratedLedgerToFlatFee() {
        Tenant tenant = createTenant("정정대상업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 6), null, 250_000);
        // 8/6~9/5 = 딱 1개월인데, 예전 방식(달마다 일할 나눠 합산)으로 어중간하게 청구된 상태를 재현
        BillingLedger ledger = createLedger(tenant, order, customer,
                LocalDate.of(2026, 8, 6), LocalDate.of(2026, 9, 5), new BigDecimal("251344.09"));
        ledger = billingLedgerRepository.findById(ledger.getId()).orElseThrow();
        ledger.issue(LocalDate.of(2026, 9, 5));
        billingLedgerRepository.save(ledger);

        int fixed = billingBatchService.recalcRollingMonthProration();

        assertThat(fixed).isGreaterThanOrEqualTo(1);
        BillingLedger refreshed = billingLedgerRepository.findById(ledger.getId()).orElseThrow();
        assertThat(refreshed.getBaseAmount()).isEqualByComparingTo("250000.00");
        assertThat(refreshed.getBalance()).isEqualByComparingTo("250000.00");
    }

    @Test
    @DisplayName("[신규] 예전 방식으로 재현이 안 되는(요금 변경·수동 편집된) 원장은 건드리지 않는다")
    void doesNotTouchLedgerNotMatchingLegacyFormula() {
        Tenant tenant = createTenant("수동편집업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 6), null, 250_000);
        // 예전 알고리즘으로도 나올 수 없는 임의의 금액 — 관리자가 수동으로 고친 상황을 재현
        BillingLedger ledger = createLedger(tenant, order, customer,
                LocalDate.of(2026, 8, 6), LocalDate.of(2026, 9, 5), new BigDecimal("123456.78"));
        ledger = billingLedgerRepository.findById(ledger.getId()).orElseThrow();
        ledger.issue(LocalDate.of(2026, 9, 5));
        billingLedgerRepository.save(ledger);
        Long ledgerId = ledger.getId();

        billingBatchService.recalcRollingMonthProration();

        BillingLedger refreshed = billingLedgerRepository.findById(ledgerId).orElseThrow();
        assertThat(refreshed.getBaseAmount()).isEqualByComparingTo("123456.78");
    }

    /** 8/15 시작, 최초 원장 [8/15~9/14](월경계 아닌 롤링 기간)까지 세팅된 계약을 만든다. */
    private StorageOrder seedOrderWithInitialLedger() {
        Tenant tenant = createTenant("테스트업체");
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 8, 15), null, 100_000);
        createLedger(tenant, order, customer,
                LocalDate.of(2026, 8, 15), LocalDate.of(2026, 9, 14), new BigDecimal("100000.00"));
        return order;
    }

    private List<BillingLedger> ledgersSortedByPeriodStart(StorageOrder order) {
        return billingLedgerRepository.findByStorageOrderId(order.getId()).stream()
                .sorted(Comparator.comparing(BillingLedger::getBillingPeriodStart))
                .toList();
    }

    /** 인접한 원장들의 기간이 하루도 비지 않고(gap) 겹치지도(overlap) 않는지 확인 */
    private void assertContinuous(List<BillingLedger> ledgers) {
        for (int i = 1; i < ledgers.size(); i++) {
            LocalDate prevEnd = ledgers.get(i - 1).getBillingPeriodEnd();
            LocalDate curStart = ledgers.get(i).getBillingPeriodStart();
            assertThat(curStart).isEqualTo(prevEnd.plusDays(1));
        }
    }
}
