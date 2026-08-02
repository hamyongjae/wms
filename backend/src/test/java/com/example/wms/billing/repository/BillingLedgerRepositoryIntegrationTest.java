package com.example.wms.billing.repository;

import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.support.IntegrationTestBase;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.warehouse.entity.Warehouse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ===== [네이티브 쿼리 테넌트 격리 회귀 테스트] =====
 *
 * backend/docs/tenant-isolation-design.md 의 "한계" 절이 명시하는 유일한 위험 지점:
 * {@code aggregateMonthlyRevenue}는 {@code nativeQuery = true}라 Hibernate의 자동 tenant_id
 * 필터가 적용되지 않고, 쿼리 안에 손으로 넣은 {@code where l.tenant_id = :tenantId}만이 유일한 방어선이다.
 * 이 조건이 실수로 빠지면 다른 업체 매출이 그대로 합산되어 노출된다 — 그래서 로그인 여부와 무관하게
 * (심지어 아무도 로그인하지 않은 상태에서도) 정확히 그 테넌트의 금액만 나오는지 직접 확인한다.
 */
class BillingLedgerRepositoryIntegrationTest extends IntegrationTestBase {

    @Test
    @DisplayName("월별 매출 집계(네이티브 쿼리)는 로그인 여부와 무관하게 파라미터로 넘긴 테넌트의 금액만 합산한다 — 다른 업체 금액은 절대 섞이면 안 된다")
    void aggregateMonthlyRevenueNeverLeaksAcrossTenants() {
        Tenant tenantA = createTenant("A업체");
        Tenant tenantB = createTenant("B업체");

        BigDecimal ledgerAAmount = new BigDecimal("1000000.00");
        BigDecimal ledgerBAmount = new BigDecimal("9999999.00"); // A의 금액과 절대 헷갈릴 수 없는 값

        seedLedger(tenantA, ledgerAAmount);
        seedLedger(tenantB, ledgerBAmount);

        // 아무도 로그인하지 않은 상태(ROOT) — 네이티브 쿼리는 어차피 Hibernate 필터를 안 타므로
        // 이 테스트가 "로그인 컨텍스트 덕분에 우연히 격리됐다"는 착시를 배제한다.
        List<Object[]> rows = billingLedgerRepository.aggregateMonthlyRevenue(
                tenantA.getId(), LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31));

        assertThat(rows).hasSize(1);
        Object[] row = rows.get(0);
        assertThat(row[0]).isEqualTo("2026-01");
        assertThat(new BigDecimal(row[1].toString())).isEqualByComparingTo(ledgerAAmount);
        // B업체 금액(9999999)이 조금이라도 섞였다면 이 값과 절대 같을 수 없다
        assertThat(new BigDecimal(row[1].toString())).isNotEqualByComparingTo(ledgerBAmount);
    }

    private void seedLedger(Tenant tenant, BigDecimal baseAmount) {
        Warehouse warehouse = createWarehouse(tenant);
        Customer customer = createCustomer(tenant);
        StorageOrder order = createOrder(tenant, customer, warehouse,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), baseAmount.intValue());
        createLedger(tenant, order, customer,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), baseAmount);
    }
}
