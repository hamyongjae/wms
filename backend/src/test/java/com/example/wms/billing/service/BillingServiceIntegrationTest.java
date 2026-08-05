package com.example.wms.billing.service;

import com.example.wms.billing.dto.AdjustmentRequest;
import com.example.wms.billing.dto.BillingLedgerResponse;
import com.example.wms.billing.dto.LedgerCreateRequest;
import com.example.wms.billing.dto.LedgerEditRequest;
import com.example.wms.billing.dto.MidReleaseRequest;
import com.example.wms.billing.dto.PaymentRequest;
import com.example.wms.billing.entity.AdjustmentType;
import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingStatus;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.PaymentHistory;
import com.example.wms.billing.entity.PaymentMethod;
import com.example.wms.billing.entity.SettlementType;
import com.example.wms.billing.repository.BillingAdjustmentRepository;
import com.example.wms.billing.repository.PaymentHistoryRepository;
import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.support.IntegrationTestBase;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.user.entity.UserRole;
import com.example.wms.warehouse.entity.Warehouse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * ===== [정산·매출 전수 회귀 테스트] =====
 *
 * {@link BillingService}는 이 세션에서 여러 차례 손으로 고친 가장 위험한 파일인데도
 * (createLedger 중복 방지, editLedger 입금액 증감 동시 처리, deleteLedger 공백 메우기,
 * reconcileSchedulePlacement 자동 보정) 서비스 레벨 통합테스트가 하나도 없었다. 도메인
 * 단위테스트({@link com.example.wms.billing.entity.BillingLedgerTest})는 잔액 공식·상태
 * 전이만 검증하고, 리포지토리·테넌트 격리·비관적 락까지 실제로 얽히는 서비스 오케스트레이션은
 * 검증한 적이 없다. 실제 Postgres 위에서 모든 정산 거래(생성·수정·삭제·수금·조정·환불·
 * 납기변경·중도출고)를 전수로 검증한다.
 *
 * [트랜잭션 경계] Hibernate는 세션(=한 트랜잭션)을 열 때 테넌트 식별자를 딱 한 번만 확인한다.
 * setUp()의 첫 호출인 createTenant()는 runAs로 감싸지 않은 채(Tenant는 @TenantId 대상이 아니므로)
 * 세션을 여는데, 이 시점엔 아직 로그인도·override도 없어 ROOT로 세션이 고정돼 버린다. 그러면 그
 * 뒤에 이어지는 createWarehouse(runAs)·loginAs가 전부 무의미해진다(TenantIsolationIntegrationTest
 * 클래스 주석에 동일하게 문서화됨). NOT_SUPPORTED로 오버라이드해 각 호출이 매번 새 트랜잭션(=세션)에서
 * 실행되게 한다 — 대신 롤백이 안 되므로, 이 클래스의 모든 단정은 항상 특정 id로 조회해 검증한다.
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class BillingServiceIntegrationTest extends IntegrationTestBase {

    @Autowired private BillingService billingService;
    @Autowired private PaymentHistoryRepository paymentHistoryRepository;
    @Autowired private BillingAdjustmentRepository adjustmentRepository;

    private Tenant tenant;
    private Warehouse warehouse;
    private Customer customer;

    @BeforeEach
    void setUp() {
        tenant = createTenant("정산테스트업체");
        warehouse = createWarehouse(tenant);
        customer = createCustomer(tenant);
        loginAs(tenant.getId(), UserRole.ADMIN);
    }

    private StorageOrder order(LocalDate start, LocalDate expectedEnd, int monthlyFee) {
        return createOrder(tenant, customer, warehouse, start, expectedEnd, monthlyFee);
    }

    private LedgerCreateRequest createReq(Long orderId, LocalDate start, LocalDate end, BigDecimal baseAmount) {
        LedgerCreateRequest req = new LedgerCreateRequest();
        ReflectionTestUtils.setField(req, "storageOrderId", orderId);
        ReflectionTestUtils.setField(req, "billingType", BillingType.MONTHLY);
        ReflectionTestUtils.setField(req, "settlementType", SettlementType.POSTPAID);
        ReflectionTestUtils.setField(req, "periodStart", start);
        ReflectionTestUtils.setField(req, "periodEnd", end);
        ReflectionTestUtils.setField(req, "baseAmount", baseAmount);
        return req;
    }

    private LedgerEditRequest editReq(LocalDate start, LocalDate end, BigDecimal baseAmount, BigDecimal paidAmount) {
        LedgerEditRequest req = new LedgerEditRequest();
        ReflectionTestUtils.setField(req, "periodStart", start);
        ReflectionTestUtils.setField(req, "periodEnd", end);
        ReflectionTestUtils.setField(req, "baseAmount", baseAmount);
        ReflectionTestUtils.setField(req, "paidAmount", paidAmount);
        return req;
    }

    private PaymentRequest paymentReq(BigDecimal amount) {
        PaymentRequest req = new PaymentRequest();
        ReflectionTestUtils.setField(req, "amount", amount);
        ReflectionTestUtils.setField(req, "method", PaymentMethod.BANK_TRANSFER);
        ReflectionTestUtils.setField(req, "paidOn", LocalDate.now());
        return req;
    }

    private AdjustmentRequest adjustmentReq(AdjustmentType type, BigDecimal amount, String reason) {
        AdjustmentRequest req = new AdjustmentRequest();
        ReflectionTestUtils.setField(req, "type", type);
        ReflectionTestUtils.setField(req, "amount", amount);
        ReflectionTestUtils.setField(req, "reason", reason);
        return req;
    }

    private MidReleaseRequest midReleaseReq(LocalDate actualEndDate) {
        MidReleaseRequest req = new MidReleaseRequest();
        ReflectionTestUtils.setField(req, "actualEndDate", actualEndDate);
        return req;
    }

    // ===================== 원장 생성 =====================
    @Nested
    @DisplayName("원장 생성(createLedger)")
    class CreateLedger {

        @Test
        @DisplayName("정상 생성 시 발행(ISSUED) 상태로 저장되고 잔액 = baseAmount")
        void createsIssuedLedger() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);

            BillingLedgerResponse res = billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000")));

            assertThat(res.getStatus()).isEqualTo(BillingStatus.ISSUED);
            assertThat(res.getBalance()).isEqualByComparingTo("100000.00");
        }

        @Test
        @DisplayName("baseAmount 미지정 시 계약 월정액을 일할 계산해 자동 산정한다(정확히 한 달이면 월정액과 동일)")
        void autoCalculatesBaseAmountForFullMonth() {
            StorageOrder o = order(LocalDate.of(2026, 2, 1), null, 280_000); // 2026년 2월 = 28일

            LedgerCreateRequest req = createReq(o.getId(), LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 28), null);
            BillingLedgerResponse res = billingService.createLedger(req);

            assertThat(res.getBaseAmount()).isEqualByComparingTo("280000.00");
        }

        @Test
        @DisplayName("같은 계약·같은 시작일로 두 번 생성하면(더블클릭) 두 번째는 중복 예외")
        void rejectsDuplicateStartDate() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            billingService.createLedger(createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000")));

            assertThatThrownBy(() -> billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15), new BigDecimal("50000"))))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("이미 같은 시작일");
        }

        @Test
        @DisplayName("첫 회차 시작일이 계약 보관 시작일과 다르면 예외(이웃이 없을 때는 계약 경계와 일치해야 함)")
        void firstLedgerMustStartAtOrderStartDate() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);

            assertThatThrownBy(() -> billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 5), LocalDate.of(2026, 1, 31), new BigDecimal("80000"))))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("보관 시작일");
        }

        @Test
        @DisplayName("이미 종료된(actualEndDate 확정) 계약에서 마지막 회차 종료일이 실제 출고일과 다르면 예외")
        void lastLedgerMustEndAtActualEndDateWhenOrderClosed() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 100_000);
            o.release(LocalDate.of(2026, 1, 31));
            storageOrderRepository.save(o);

            assertThatThrownBy(() -> billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20), new BigDecimal("70000"))))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("실제 출고일");
        }

        @Test
        @DisplayName("[자동 보정] 기존 회차 뒤에 공백을 두고 새 회차를 만들면 이전 회차 종료일이 자동으로 이어붙는다")
        void autoFillsGapAfterExistingLedger() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger first = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20), new BigDecimal("100000.00"));

            // 1/20 종료인데 2/1부터 새 회차를 만듦 — 1/21~1/31 공백이 생김
            billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 2, 1), LocalDate.of(2026, 2, 28), new BigDecimal("100000")));

            BillingLedger refreshed = billingLedgerRepository.findById(first.getId()).orElseThrow();
            assertThat(refreshed.getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 1, 31));
        }

        @Test
        @DisplayName("[자동 보정] 기존 회차보다 앞선 구간을 새로 만들면 기존 회차 시작일이 자동으로 밀린다")
        void autoFillsGapBeforeExistingLedger() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger existing = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 15), LocalDate.of(2026, 2, 14), new BigDecimal("100000.00"));

            // 계약 보관시작일(1/1)부터 1/20까지 새 회차를 만들면 기존 회차(1/15~)와 겹친다 —
            // 기존 회차 시작일이 새 회차 종료일 다음날로 자동으로 밀려야 한다.
            billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20), new BigDecimal("64516")));

            BillingLedger refreshed = billingLedgerRepository.findById(existing.getId()).orElseThrow();
            assertThat(refreshed.getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 1, 21));
            assertThat(refreshed.getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 2, 14)); // 종료일은 그대로
        }

        @Test
        @DisplayName("새 회차가 다음 회차를 완전히 뒤덮으면(다음 회차가 통째로 사라지는 크기) 자동 보정 대신 예외")
        void rejectsWhenNewLedgerWouldSwallowNextNeighbor() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            // 다음 회차가 아주 짧은 구간(1/15~1/20)만 차지하고 있는 상황
            createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 15), LocalDate.of(2026, 1, 20), new BigDecimal("20000.00"));

            // 계약 시작일(1/1)부터 1/25까지 새 회차를 만들면 다음 회차(1/15~1/20) 전체를 뒤덮는다 —
            // 다음 회차 시작일을 1/26로 밀면 그 회차 종료일(1/20)보다 뒤가 되어 완전히 사라진다.
            assertThatThrownBy(() -> billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 25), new BigDecimal("100000"))))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("다음 회차");
        }

        @Test
        @DisplayName("청구 기간이 계약 종료일을 넘으면 계약의 출고예정일이 자동으로 연장된다")
        void extendsOrderExpectedEndDate() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 100_000);

            billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 2, 28), new BigDecimal("200000")));

            StorageOrder refreshed = storageOrderRepository.findById(o.getId()).orElseThrow();
            assertThat(refreshed.getExpectedEndDate()).isEqualTo(LocalDate.of(2026, 2, 28));
        }

        @Test
        @DisplayName("출고일 미정(null) 계약은 회차를 만들어도 출고예정일이 임의로 채워지지 않는다")
        void preservesNullExpectedEndDate() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);

            billingService.createLedger(
                    createReq(o.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000")));

            StorageOrder refreshed = storageOrderRepository.findById(o.getId()).orElseThrow();
            assertThat(refreshed.getExpectedEndDate()).isNull();
        }
    }

    // ===================== 원장 수정(일정 수정) =====================
    @Nested
    @DisplayName("원장 수정(editLedger)")
    class EditLedger {

        @Test
        @DisplayName("기간·금액만 수정하면(paidAmount 미지정) 입금 이력은 생성되지 않는다")
        void revisesScheduleWithoutTouchingPayment() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000.00"));
            l = billingLedgerRepository.findById(l.getId()).orElseThrow();
            l.issue(LocalDate.of(2026, 1, 31));
            billingLedgerRepository.save(l);

            BillingLedgerResponse res = billingService.editLedger(l.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20), new BigDecimal("70000"), null));

            assertThat(res.getPeriodEnd()).isEqualTo(LocalDate.of(2026, 1, 20));
            assertThat(res.getBaseAmount()).isEqualByComparingTo("70000.00");
            assertThat(paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId())).isEmpty();
        }

        @Test
        @DisplayName("입금액을 현재보다 늘리면 차액만큼 입금 이력이 생기고 상태가 부분입금/완납으로 전이한다")
        void increasingPaidAmountRecordsPaymentAndTransitionsStatus() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            BillingLedgerResponse res = billingService.editLedger(l.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000"), new BigDecimal("40000")));

            assertThat(res.getStatus()).isEqualTo(BillingStatus.PARTIALLY_PAID);
            assertThat(res.getPaidTotal()).isEqualByComparingTo("40000.00");
            List<PaymentHistory> payments = paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId());
            assertThat(payments).hasSize(1);
            assertThat(payments.get(0).getAmount()).isEqualByComparingTo("40000.00");

            // 전액까지 늘리면 완납으로 전이하고, 두 번째 입금 이력이 추가로 남는다(차액만)
            BillingLedgerResponse res2 = billingService.editLedger(l.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000"), new BigDecimal("100000")));
            assertThat(res2.getStatus()).isEqualTo(BillingStatus.PAID);
            List<PaymentHistory> payments2 = paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId());
            assertThat(payments2).hasSize(2);
            assertThat(payments2.get(1).getAmount()).isEqualByComparingTo("60000.00");
        }

        @Test
        @DisplayName("입금액을 현재보다 줄이면 음수 정정 이력이 남고 잔액이 그만큼 되돌아간다")
        void decreasingPaidAmountRecordsNegativeCorrection() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.editLedger(l.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000"), new BigDecimal("100000")));

            BillingLedgerResponse res = billingService.editLedger(l.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000"), new BigDecimal("30000")));

            assertThat(res.getStatus()).isEqualTo(BillingStatus.PARTIALLY_PAID);
            assertThat(res.getPaidTotal()).isEqualByComparingTo("30000.00");
            List<PaymentHistory> payments = paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId());
            assertThat(payments).hasSize(2);
            assertThat(payments.get(1).getAmount()).isEqualByComparingTo("-70000.00");
        }

        @Test
        @DisplayName("입금액에 음수를 직접 넣으면 예외")
        void rejectsNegativePaidAmount() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            assertThatThrownBy(() -> billingService.editLedger(l.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000"), new BigDecimal("-1"))))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("0 이상");
        }

        @Test
        @DisplayName("[자동 보정] 종료일을 늘리면 다음 회차 시작일이 자동으로 밀린다")
        void extendingEndDateShiftsNextLedgerStart() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger first = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 20), new BigDecimal("70000.00"));
            first = billingLedgerRepository.findById(first.getId()).orElseThrow();
            first.issue(LocalDate.of(2026, 1, 20));
            billingLedgerRepository.save(first);
            BillingLedger second = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 21), LocalDate.of(2026, 2, 19), new BigDecimal("100000.00"));
            second = billingLedgerRepository.findById(second.getId()).orElseThrow();
            second.issue(LocalDate.of(2026, 2, 19));
            billingLedgerRepository.save(second);

            billingService.editLedger(first.getId(),
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 25), new BigDecimal("70000"), null));

            BillingLedger refreshedSecond = billingLedgerRepository.findById(second.getId()).orElseThrow();
            assertThat(refreshedSecond.getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 1, 26));
        }

        @Test
        @DisplayName("취소된 원장은 일정을 수정할 수 없다")
        void cannotReviseCanceledLedger() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            l = billingLedgerRepository.findById(l.getId()).orElseThrow();
            l.cancel();
            billingLedgerRepository.save(l);

            Long id = l.getId();
            assertThatThrownBy(() -> billingService.editLedger(id,
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("50000"), null)))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    // ===================== 원장 삭제 =====================
    @Nested
    @DisplayName("원장 삭제(deleteLedger)")
    class DeleteLedger {

        @Test
        @DisplayName("입금 내역이 있는 원장은 삭제할 수 없다")
        void cannotDeleteLedgerWithPayments() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("10000")));

            Long id = l.getId();
            assertThatThrownBy(() -> billingService.deleteLedger(id))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("수금 내역");
        }

        @Test
        @DisplayName("조정(할인)만 있고 실제 입금은 없는 원장은 삭제할 수 있다")
        void canDeleteLedgerWithOnlyAdjustments() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.applyAdjustment(l.getId(), adjustmentReq(AdjustmentType.DISCOUNT, new BigDecimal("100000"), "전액 할인"));

            billingService.deleteLedger(l.getId());

            assertThat(billingLedgerRepository.findById(l.getId())).isEmpty();
        }

        @Test
        @DisplayName("중간 회차를 삭제하면 앞뒤 남은 회차가 자동으로 이어붙는다(공백 없음)")
        void fillsGapWhenDeletingMiddleLedger() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l1 = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 10), new BigDecimal("30000.00"));
            BillingLedger l2 = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 11), LocalDate.of(2026, 1, 20), new BigDecimal("30000.00"));
            BillingLedger l3 = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 21), LocalDate.of(2026, 1, 31), new BigDecimal("33000.00"));

            billingService.deleteLedger(l2.getId());

            BillingLedger refreshed1 = billingLedgerRepository.findById(l1.getId()).orElseThrow();
            assertThat(refreshed1.getBillingPeriodEnd()).isEqualTo(LocalDate.of(2026, 1, 20));
            assertThat(billingLedgerRepository.findById(l3.getId())).isPresent();
            assertThat(billingLedgerRepository.findById(l2.getId())).isEmpty();
        }

        @Test
        @DisplayName("맨 처음 회차를 삭제하면(뒤만 있음) 이웃 보정 없이 그냥 삭제된다")
        void deletingFirstLedgerDoesNotTouchNext() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l1 = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 10), new BigDecimal("30000.00"));
            BillingLedger l2 = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 11), LocalDate.of(2026, 1, 31), new BigDecimal("70000.00"));

            billingService.deleteLedger(l1.getId());

            BillingLedger refreshed2 = billingLedgerRepository.findById(l2.getId()).orElseThrow();
            assertThat(refreshed2.getBillingPeriodStart()).isEqualTo(LocalDate.of(2026, 1, 11));
        }

        @Test
        @DisplayName("계약의 유일한 회차를 삭제하면 정상적으로 원장이 0건이 된다")
        void deletingOnlyLedgerLeavesNoLedgers() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = createLedger(tenant, o, customer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000.00"));

            billingService.deleteLedger(l.getId());

            assertThat(billingLedgerRepository.findByStorageOrderId(o.getId())).isEmpty();
        }

        @Test
        @DisplayName("삭제 시 연결된 조정 이력도 함께 지워진다")
        void deletingLedgerCascadesAdjustments() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.applyAdjustment(l.getId(), adjustmentReq(AdjustmentType.DISCOUNT, new BigDecimal("100000"), "전액 할인"));

            billingService.deleteLedger(l.getId());

            assertThat(adjustmentRepository.findByBillingLedgerIdAndTenantIdOrderByCreatedAtAsc(l.getId(), tenant.getId()))
                    .isEmpty();
        }
    }

    // ===================== 수금 =====================
    @Nested
    @DisplayName("수금(recordPayment/reversePayment/restorePayment)")
    class Payment {

        @Test
        @DisplayName("부분 수금 → PARTIALLY_PAID, 전액 수금 → PAID")
        void partialThenFullPayment() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            BillingLedgerResponse partial = billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("40000")));
            assertThat(partial.getStatus()).isEqualTo(BillingStatus.PARTIALLY_PAID);

            BillingLedgerResponse full = billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("60000")));
            assertThat(full.getStatus()).isEqualTo(BillingStatus.PAID);
            assertThat(full.getBalance()).isEqualByComparingTo("0.00");
        }

        @Test
        @DisplayName("수금 취소(reversePayment) 시 잔액과 상태가 원복된다")
        void reversePaymentRestoresBalance() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("100000")));
            List<PaymentHistory> payments = paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId());
            Long paymentId = payments.get(0).getId();

            BillingLedgerResponse res = billingService.reversePayment(paymentId);

            assertThat(res.getStatus()).isEqualTo(BillingStatus.ISSUED);
            assertThat(res.getBalance()).isEqualByComparingTo("100000.00");
        }

        @Test
        @DisplayName("이미 취소된 수금 건을 다시 취소하면 예외")
        void cannotReverseAlreadyReversedPayment() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("100000")));
            Long paymentId = paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId()).get(0).getId();
            billingService.reversePayment(paymentId);

            assertThatThrownBy(() -> billingService.reversePayment(paymentId))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("이미 취소");
        }

        @Test
        @DisplayName("취소된 수금 건을 복원(restorePayment)하면 잔액에 다시 반영된다")
        void restorePaymentReappliesAmount() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("40000")));
            Long paymentId = paymentHistoryRepository
                    .findByBillingLedgerIdAndTenantIdOrderByPaidOnAsc(l.getId(), tenant.getId()).get(0).getId();
            billingService.reversePayment(paymentId);

            BillingLedgerResponse res = billingService.restorePayment(paymentId);

            assertThat(res.getStatus()).isEqualTo(BillingStatus.PARTIALLY_PAID);
            assertThat(res.getPaidTotal()).isEqualByComparingTo("40000.00");
        }
    }

    // ===================== 조정/할인 =====================
    @Nested
    @DisplayName("조정(applyAdjustment)")
    class Adjustment {

        @Test
        @DisplayName("DISCOUNT는 입력 크기와 무관하게 항상 잔액을 차감한다(부호 강제)")
        void discountAlwaysReducesBalance() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            BillingLedgerResponse res = billingService.applyAdjustment(l.getId(),
                    adjustmentReq(AdjustmentType.DISCOUNT, new BigDecimal("10000"), "단골 할인"));

            assertThat(res.getBalance()).isEqualByComparingTo("90000.00");
        }

        @Test
        @DisplayName("SURCHARGE는 항상 잔액을 가산한다")
        void surchargeAlwaysIncreasesBalance() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            BillingLedgerResponse res = billingService.applyAdjustment(l.getId(),
                    adjustmentReq(AdjustmentType.SURCHARGE, new BigDecimal("5000"), "연체료"));

            assertThat(res.getBalance()).isEqualByComparingTo("105000.00");
        }

        @Test
        @DisplayName("CORRECTION은 입력한 부호를 그대로 반영한다")
        void correctionUsesInputSignVerbatim() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            BillingLedgerResponse res = billingService.applyAdjustment(l.getId(),
                    adjustmentReq(AdjustmentType.CORRECTION, new BigDecimal("-20000"), "오기입 정정"));

            assertThat(res.getBalance()).isEqualByComparingTo("80000.00");
        }
    }

    // ===================== 환불 =====================
    @Nested
    @DisplayName("환불(completeRefund)")
    class Refund {

        @Test
        @DisplayName("과오납(잔액 음수) 발생 후 환불 완료 처리하면 잔액이 0으로 마감된다")
        void completesRefundForOverpayment() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("100000")));
            billingService.applyAdjustment(l.getId(), adjustmentReq(AdjustmentType.DISCOUNT, new BigDecimal("30000"), "사후 할인"));
            BillingLedger refreshed = billingLedgerRepository.findById(l.getId()).orElseThrow();
            assertThat(refreshed.getBalance()).isEqualByComparingTo("-30000.00");

            BillingLedgerResponse res = billingService.completeRefund(l.getId());

            assertThat(res.getBalance()).isEqualByComparingTo("0.00");
            assertThat(res.isRefundCompleted()).isTrue();
        }

        @Test
        @DisplayName("환불 대상 금액이 없는데 환불 완료 처리를 시도하면 예외")
        void cannotCompleteRefundWithoutOverpayment() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            Long id = l.getId();
            assertThatThrownBy(() -> billingService.completeRefund(id))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("이미 환불 완료된 원장을 다시 완료 처리하면 예외")
        void cannotCompleteRefundTwice() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("130000")));
            billingService.completeRefund(l.getId());

            Long id = l.getId();
            assertThatThrownBy(() -> billingService.completeRefund(id))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("이미 환불");
        }
    }

    // ===================== 납기일 변경 =====================
    @Nested
    @DisplayName("납기일 변경(changeDueDate)")
    class DueDate {

        @Test
        @DisplayName("납기일을 변경하면 그대로 반영된다")
        void changesDueDate() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "100000.00");

            BillingLedgerResponse res = billingService.changeDueDate(l.getId(), LocalDate.of(2026, 2, 10));

            assertThat(res.getDueDate()).isEqualTo(LocalDate.of(2026, 2, 10));
        }
    }

    // ===================== 중도 출고 정산 =====================
    @Nested
    @DisplayName("중도 출고 정산(applyMidRelease)")
    class MidRelease {

        @Test
        @DisplayName("월 중간에 출고하면 사용하지 않은 기간만큼 환급 조정이 잡힌다")
        void refundsUnusedPortionOnEarlyRelease() {
            StorageOrder o = order(LocalDate.of(2026, 1, 1), null, 310_000); // 1월 = 31일, 일 단가 10000
            BillingLedger l = issuedLedger(o, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), "310000.00");
            billingService.recordPayment(l.getId(), paymentReq(new BigDecimal("310000")));

            var res = billingService.applyMidRelease(l.getId(), midReleaseReq(LocalDate.of(2026, 1, 10)));

            // 1/1~1/10 = 10일 사용분만 청구, 나머지는 환급 조정으로 잔액이 음수(환불 대상)가 된다
            assertThat(res.getLedger().getBalance()).isEqualByComparingTo("-210000.00");
        }
    }

    // ===================== 테넌트 격리 =====================
    @Nested
    @DisplayName("테넌트 격리")
    class TenantIsolation {

        @Test
        @DisplayName("다른 업체의 원장 id로 수정을 시도하면 존재하지 않는 원장으로 취급한다")
        void cannotEditOtherTenantsLedger() {
            Tenant otherTenant = createTenant("남의업체");
            Warehouse otherWarehouse = createWarehouse(otherTenant);
            Customer otherCustomer = createCustomer(otherTenant);
            StorageOrder otherOrder = createOrder(otherTenant, otherCustomer, otherWarehouse,
                    LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger otherLedger = createLedger(otherTenant, otherOrder, otherCustomer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000.00"));

            // 현재 로그인 컨텍스트는 setUp()에서 만든 tenant(정산테스트업체) — 남의 원장을 건드림
            Long otherLedgerId = otherLedger.getId();
            assertThatThrownBy(() -> billingService.editLedger(otherLedgerId,
                    editReq(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("1"), null)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("존재하지 않는");
        }

        @Test
        @DisplayName("다른 업체의 원장 id로 수금을 시도하면 존재하지 않는 원장으로 취급한다")
        void cannotRecordPaymentOnOtherTenantsLedger() {
            Tenant otherTenant = createTenant("남의업체2");
            Warehouse otherWarehouse = createWarehouse(otherTenant);
            Customer otherCustomer = createCustomer(otherTenant);
            StorageOrder otherOrder = createOrder(otherTenant, otherCustomer, otherWarehouse,
                    LocalDate.of(2026, 1, 1), null, 100_000);
            BillingLedger otherLedger = createLedger(otherTenant, otherOrder, otherCustomer,
                    LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), new BigDecimal("100000.00"));

            Long otherLedgerId = otherLedger.getId();
            assertThatThrownBy(() -> billingService.recordPayment(otherLedgerId, paymentReq(new BigDecimal("1000"))))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("존재하지 않는");
        }
    }

    /** 발행(ISSUED) 상태까지 만들어둔 원장 — 이 클래스의 대다수 테스트가 여기서 시작한다. */
    private BillingLedger issuedLedger(StorageOrder order, LocalDate start, LocalDate end, String baseAmount) {
        BillingLedger l = createLedger(tenant, order, customer, start, end, new BigDecimal(baseAmount));
        l = billingLedgerRepository.findById(l.getId()).orElseThrow();
        l.issue(end);
        return billingLedgerRepository.save(l);
    }
}
