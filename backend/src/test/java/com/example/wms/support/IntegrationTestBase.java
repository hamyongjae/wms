package com.example.wms.support;

import com.example.wms.billing.entity.BillingLedger;
import com.example.wms.billing.entity.BillingType;
import com.example.wms.billing.entity.SettlementType;
import com.example.wms.billing.repository.BillingLedgerRepository;
import com.example.wms.customer.entity.Customer;
import com.example.wms.customer.entity.CustomerType;
import com.example.wms.customer.repository.CustomerRepository;
import com.example.wms.order.entity.StorageOrder;
import com.example.wms.order.repository.StorageOrderRepository;
import com.example.wms.security.UserPrincipal;
import com.example.wms.security.tenant.TenantContext;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.tenant.repository.TenantRepository;
import com.example.wms.user.entity.UserRole;
import com.example.wms.warehouse.entity.Warehouse;
import com.example.wms.warehouse.repository.WarehouseRepository;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/**
 * ===== [통합테스트 베이스] =====
 *
 * 실제 Postgres(Testcontainers) 위에서 서비스/리포지토리를 검증한다.
 * 네이티브 쿼리(date_trunc, to_char 등 Postgres 전용 함수)는 H2로 대체 불가하므로
 * 이 방식만이 실제 운영 DB와 동일한 동작을 보장한다.
 *
 * [싱글톤 컨테이너 패턴] 일부러 {@code @Testcontainers}/{@code @Container}를 쓰지 않고 static
 * 블록에서 직접 start() 한다. 그 어노테이션들은 컨테이너를 "테스트 클래스마다" 시작·종료하는데,
 * Spring은 {@code @SpringBootTest} 설정이 동일하면 ApplicationContext(그 안의 DataSource·포트)를
 * 캐시해서 다음 클래스에 재사용한다. 컨테이너가 클래스마다 재시작되면 포트가 바뀌는데 캐시된
 * DataSource는 예전 포트를 그대로 들고 있어 "Connection refused"로 깨진다 — 컨테이너를 JVM 전체
 * 수명 동안 하나만 띄우고 절대 stop() 하지 않아야(Testcontainers Ryuk가 JVM 종료 시 정리) 이 문제가 없다.
 *
 * 기본적으로 {@code @Transactional} 이라 각 테스트 메서드 종료 시 자동 롤백된다.
 * 여러 스레드로 동시성을 검증하는 테스트(비관적 락 등)는 트랜잭션이 스레드를 넘어 공유되면
 * 검증 자체가 무의미해지므로, 해당 테스트 클래스에서
 * {@code @Transactional(propagation = Propagation.NOT_SUPPORTED)} 로 오버라이드해야 한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public abstract class IntegrationTestBase {

    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired protected TenantRepository tenantRepository;
    @Autowired protected WarehouseRepository warehouseRepository;
    @Autowired protected CustomerRepository customerRepository;
    @Autowired protected StorageOrderRepository storageOrderRepository;
    @Autowired protected BillingLedgerRepository billingLedgerRepository;

    private static final AtomicLong SEQ = new AtomicLong();

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    /** 테넌트(업체)는 @TenantId 대상이 아니므로 컨텍스트와 무관하게 바로 생성 가능 */
    protected Tenant createTenant(String name) {
        Tenant tenant = new Tenant(name, "BN-" + SEQ.incrementAndGet(), "대표", "010-0000-0000",
                name + "@test.com", "테스트 주소");
        return tenantRepository.save(tenant);
    }

    /** 해당 테넌트로 로그인한 것처럼 SecurityContext를 채운다 (TenantContext.current()가 이 값을 따르게 됨) */
    protected void loginAs(Long tenantId, UserRole role) {
        UserPrincipal principal = new UserPrincipal(SEQ.incrementAndGet(), tenantId, "tester", role);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));
    }

    protected Warehouse createWarehouse(Tenant tenant) {
        return TenantContext.runAs(tenant.getId(), () ->
                warehouseRepository.save(new Warehouse("테스트창고", "주소", "010-0000-0000", tenant)));
    }

    protected Customer createCustomer(Tenant tenant) {
        return TenantContext.runAs(tenant.getId(), () ->
                customerRepository.save(new Customer(tenant, "테스트고객-" + SEQ.incrementAndGet(),
                        CustomerType.INDIVIDUAL, null, "010-1111-2222", null, null)));
    }

    protected StorageOrder createOrder(Tenant tenant, Customer customer, Warehouse warehouse,
                                       LocalDate storageStartDate, LocalDate expectedEndDate,
                                       Integer monthlyFee) {
        return TenantContext.runAs(tenant.getId(), () ->
                storageOrderRepository.save(new StorageOrder(tenant, customer, warehouse,
                        storageStartDate, expectedEndDate, monthlyFee, null, null)));
    }

    protected BillingLedger createLedger(Tenant tenant, StorageOrder order, Customer customer,
                                         LocalDate periodStart, LocalDate periodEnd, BigDecimal baseAmount) {
        return TenantContext.runAs(tenant.getId(), () ->
                billingLedgerRepository.save(new BillingLedger(tenant, order, customer,
                        "LEDGER-" + UUID.randomUUID(), BillingType.MONTHLY, SettlementType.POSTPAID,
                        periodStart, periodEnd, baseAmount, BigDecimal.ZERO, periodEnd)));
    }
}
