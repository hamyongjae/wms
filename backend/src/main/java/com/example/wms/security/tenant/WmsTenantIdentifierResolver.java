package com.example.wms.security.tenant;

import org.hibernate.context.spi.CurrentTenantIdentifierResolver;

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
 * <h3>등록 방법</h3>
 * Spring 빈이 아니라 <b>application.yml 의 프로퍼티</b>로 등록한다.
 * <pre>
 * spring.jpa.properties.hibernate.tenant_identifier_resolver:
 *     com.example.wms.security.tenant.WmsTenantIdentifierResolver
 * </pre>
 * Hibernate 가 이 클래스를 직접 인스턴스화한다(기본 생성자 필요).
 * Spring Boot 의 {@code HibernatePropertiesCustomizer} 를 쓰지 않는 이유는,
 * 그 인터페이스의 패키지가 Boot 메이저 버전마다 이동해 왔기 때문이다.
 * 이 클래스는 상태를 갖지 않고 {@link TenantContext} 의 정적 메서드만 참조하므로
 * 의존성 주입이 필요 없고, 덕분에 Hibernate SPI 하나에만 의존할 수 있다.
 *
 * <h3>한계 — 반드시 알고 있어야 할 것</h3>
 * 네이티브 SQL({@code @Query(nativeQuery = true)})에는 이 필터가 적용되지 않는다.
 * 네이티브 쿼리를 쓸 때는 지금처럼 직접 tenant 조건을 넣어야 한다.
 */
public class WmsTenantIdentifierResolver implements CurrentTenantIdentifierResolver<Long> {

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
}
