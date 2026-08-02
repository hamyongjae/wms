package com.example.wms.security.tenant;

import org.hibernate.cfg.AvailableSettings;
import org.hibernate.context.spi.CurrentTenantIdentifierResolver;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * ===== [Hibernate 테넌트 리졸버] =====
 *
 * Hibernate 는 세션을 열 때마다 "지금 누구냐"를 이 객체에게 묻고,
 * {@code @TenantId} 가 붙은 엔티티의 모든 조회(find·JPQL·연관관계 로딩)에
 * {@code tenant_id = ?} 조건을 자동으로 덧붙인다. 저장 시에는 이 값을 자동으로 채운다.
 *
 * <p>즉 서비스 코드가 조건을 깜빡해도 다른 업체 데이터가 넘어오지 않는다.
 * 격리가 '개발자의 습관'에서 'ORM 의 기본 동작'으로 내려온 것이 이 클래스의 존재 이유다.
 *
 * <h3>한계 — 반드시 알고 있어야 할 것</h3>
 * 네이티브 SQL({@code @Query(nativeQuery = true)})에는 이 필터가 적용되지 않는다.
 * 네이티브 쿼리를 쓸 때는 지금처럼 직접 tenant 조건을 넣어야 한다.
 */
@Component
public class WmsTenantIdentifierResolver
        implements CurrentTenantIdentifierResolver<Long>, HibernatePropertiesCustomizer {

    @Override
    public Long resolveCurrentTenantIdentifier() {
        return TenantContext.current();
    }

    /**
     * ROOT 로 표시된 컨텍스트에서는 필터를 적용하지 않는다.
     * 로그인(아이디로 전 테넌트에서 사용자 조회)처럼 소속이 정해지기 전의 흐름을 위한 통로다.
     */
    @Override
    public boolean isRoot(Long tenantId) {
        return TenantContext.ROOT.equals(tenantId);
    }

    /**
     * 기존 세션의 테넌트가 바뀌었는지 매번 검증할지 여부.
     * 요청당 세션이 새로 열리는 구조라 불필요한 오버헤드만 생기므로 끈다.
     */
    @Override
    public boolean validateExistingCurrentSessions() {
        return false;
    }

    /** Spring Boot 가 만드는 EntityManagerFactory 에 이 리졸버를 등록한다. */
    @Override
    public void customize(Map<String, Object> hibernateProperties) {
        hibernateProperties.put(AvailableSettings.MULTI_TENANT_IDENTIFIER_RESOLVER, this);
    }
}
