package com.example.wms.security.tenant;

import com.example.wms.customer.entity.Customer;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.support.IntegrationTestBase;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.user.entity.UserRole;
import com.example.wms.warehouse.entity.Warehouse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ===== [테넌트 격리 통합테스트] =====
 *
 * backend/docs/tenant-isolation-design.md 가 설명하는 자동 필터가 실제 Postgres 위에서
 * 정말로 걸리는지 확인한다. 여기서 쓰는 조회 메서드들은 일부러 tenantId 파라미터가 없는
 * JpaRepository 기본 메서드(findById, findAll)를 쓴다 — "개발자가 조건을 깜빡해도 안전하다"는
 * 설계 취지 자체를 검증하려면, 조건을 아예 안 넘기는 경로로 테스트해야 의미가 있다.
 *
 * [트랜잭션 경계] Hibernate는 세션(=한 트랜잭션)을 열 때 테넌트 식별자를 딱 한 번만 확인하고
 * 이후 다시 확인하지 않는다. 이 테스트는 한 메서드 안에서 A/B 두 업체를 오가며 만들고 조회하므로,
 * IntegrationTestBase의 기본 클래스 레벨 {@code @Transactional}(전체를 한 세션으로 묶어 롤백)을
 * 그대로 쓰면 첫 번째 업체로 세션이 고정돼 버려 이후의 로그인 전환이 무의미해진다. 그래서
 * {@code NOT_SUPPORTED}로 오버라이드해 각 저장·조회가 매번 독립된(=올바른 테넌트로 새로 확정되는)
 * 트랜잭션에서 실행되게 한다(IntegrationTestBase 클래스 주석에 문서화된 사용법).
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class TenantIsolationIntegrationTest extends IntegrationTestBase {

    @Test
    @DisplayName("B업체로 로그인해 A업체 계약 id를 findById로 조회하면 보이지 않는다 (설계 문서의 '404 검증'을 리포지토리 단에서 재현)")
    void cannotSeeAnotherTenantsOrderById() {
        Tenant tenantA = createTenant("A업체");
        Tenant tenantB = createTenant("B업체");
        Warehouse warehouseA = createWarehouse(tenantA);
        Customer customerA = createCustomer(tenantA);
        StorageOrder orderA = createOrder(tenantA, customerA, warehouseA,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 100000);

        loginAs(tenantB.getId(), UserRole.ADMIN);

        assertThat(storageOrderRepository.findById(orderA.getId())).isEmpty();
    }

    @Test
    @DisplayName("A업체로 로그인한 채 findAll을 호출해도 B업체의 계약은 섞여 나오지 않는다")
    void findAllOnlyReturnsOwnTenantData() {
        Tenant tenantA = createTenant("A업체");
        Tenant tenantB = createTenant("B업체");
        Warehouse warehouseA = createWarehouse(tenantA);
        Customer customerA = createCustomer(tenantA);
        createOrder(tenantA, customerA, warehouseA,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 100000);

        Warehouse warehouseB = createWarehouse(tenantB);
        Customer customerB = createCustomer(tenantB);
        createOrder(tenantB, customerB, warehouseB,
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 200000);

        loginAs(tenantA.getId(), UserRole.ADMIN);

        assertThat(storageOrderRepository.findAll())
                .extracting(StorageOrder::getTenantId)
                .containsOnly(tenantA.getId());
    }

    @Test
    @DisplayName("고객(Customer)도 같은 필터를 탄다 — B업체 로그인 상태에서 A업체 고객 id는 안 보인다")
    void cannotSeeAnotherTenantsCustomerById() {
        Tenant tenantA = createTenant("A업체");
        Tenant tenantB = createTenant("B업체");
        Customer customerA = createCustomer(tenantA);

        loginAs(tenantB.getId(), UserRole.ADMIN);

        assertThat(customerRepository.findById(customerA.getId())).isEmpty();
    }

    @Test
    @DisplayName("인증 정보가 없는 상태(ROOT)에서 새 엔티티를 저장하면 tenant_id FK 위반으로 실패한다 (설계된 안전장치)")
    void savingWithoutTenantContextFailsFast() {
        Tenant tenant = createTenant("업체");
        // 로그인하지 않음 → TenantContext.current() == ROOT(-1) → tenant_id=-1로 INSERT 시도 → FK 위반
        assertThatThrownBy(() -> createCustomer(tenant, /* skipRunAs */ true))
                .isInstanceOf(RuntimeException.class);
    }

    private Customer createCustomer(Tenant tenant, boolean skipRunAs) {
        assertTrue(skipRunAs, "이 오버로드는 runAs 없이 직접 저장을 시도할 때만 사용한다");
        return customerRepository.save(new Customer(tenant, "무소속고객",
                com.example.wms.customer.entity.CustomerType.INDIVIDUAL, null, null, null, null));
    }
}
