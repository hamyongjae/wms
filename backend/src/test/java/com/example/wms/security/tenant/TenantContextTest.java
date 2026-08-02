package com.example.wms.security.tenant;

import com.example.wms.security.UserPrincipal;
import com.example.wms.user.entity.UserRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * ===== [테넌트 컨텍스트 회귀 테스트] =====
 *
 * 이 클래스가 반환하는 값 하나로 "이 쿼리가 어느 회사 데이터를 보는가"가 결정된다.
 * 우선순위가 흐트러지면 다른 업체 데이터가 보이거나(치명), 정상 요청이 빈 결과가 된다.
 * DB 없이 검증 가능한 순수 로직이므로 여기서 촘촘히 못 박는다.
 */
class TenantContextTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void loginAs(long tenantId) {
        UserPrincipal principal = new UserPrincipal(1L, tenantId, "tester", UserRole.ADMIN);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    }

    @Test
    @DisplayName("인증 정보가 없으면 ROOT — 로그인·회원가입처럼 소속이 정해지기 전 흐름")
    void noAuthenticationYieldsRoot() {
        assertThat(TenantContext.current()).isEqualTo(TenantContext.ROOT);
    }

    @Test
    @DisplayName("로그인 상태에서는 그 사용자의 tenantId 를 따른다")
    void authenticatedYieldsUserTenant() {
        loginAs(42L);

        assertThat(TenantContext.current()).isEqualTo(42L);
    }

    @Test
    @DisplayName("runAs 는 로그인 사용자의 tenantId 보다 우선한다 (배치·가입 직후 명시 전환)")
    void runAsOverridesAuthentication() {
        loginAs(42L);

        Long inside = TenantContext.runAs(7L, TenantContext::current);

        assertThat(inside).isEqualTo(7L);
    }

    @Test
    @DisplayName("runAs 를 벗어나면 이전 상태로 정확히 복원된다 (스레드 오염 방지)")
    void runAsRestoresPreviousState() {
        loginAs(42L);

        TenantContext.runAs(7L, () -> assertThat(TenantContext.current()).isEqualTo(7L));

        assertThat(TenantContext.current()).isEqualTo(42L);
    }

    @Test
    @DisplayName("runAs 가 중첩돼도 안쪽이 우선하고, 빠져나오면 바깥 값으로 돌아온다")
    void nestedRunAsRestoresOuterValue() {
        TenantContext.runAs(1L, () -> {
            assertThat(TenantContext.current()).isEqualTo(1L);
            TenantContext.runAs(2L, () -> assertThat(TenantContext.current()).isEqualTo(2L));
            assertThat(TenantContext.current()).isEqualTo(1L);
        });

        // 최상위를 벗어나면 override 가 완전히 제거되어 인증 기반(여기선 미인증=ROOT)으로 돌아간다
        assertThat(TenantContext.current()).isEqualTo(TenantContext.ROOT);
    }

    @Test
    @DisplayName("본문에서 예외가 나도 컨텍스트는 복원된다 (스레드풀 재사용 시 오염 차단)")
    void runAsRestoresEvenWhenBodyThrows() {
        loginAs(42L);

        try {
            TenantContext.runAs(7L, () -> {
                throw new IllegalStateException("boom");
            });
        } catch (IllegalStateException ignored) {
            // 예외 자체는 관심 밖 — 복원 여부만 본다
        }

        assertThat(TenantContext.current()).isEqualTo(42L);
    }

    @Test
    @DisplayName("runAsRoot 는 필터를 끈다 — 전역 유일성 검사·배치 스캔용")
    void runAsRootDisablesFilter() {
        loginAs(42L);

        Long inside = TenantContext.runAsRoot(TenantContext::current);

        assertThat(inside).isEqualTo(TenantContext.ROOT);
        assertThat(TenantContext.current()).isEqualTo(42L);
    }

    @Test
    @DisplayName("리졸버는 ROOT 만 루트로 인정한다 (실제 업체 id 는 반드시 필터링된다)")
    void resolverTreatsOnlyRootAsRoot() {
        WmsTenantIdentifierResolver resolver = new WmsTenantIdentifierResolver();

        assertThat(resolver.isRoot(TenantContext.ROOT)).isTrue();
        assertThat(resolver.isRoot(1L)).isFalse();
        assertThat(resolver.isRoot(42L)).isFalse();
    }

    @Test
    @DisplayName("리졸버는 현재 컨텍스트를 그대로 넘겨준다 (Hibernate 가 이 값으로 필터를 만든다)")
    void resolverDelegatesToContext() {
        WmsTenantIdentifierResolver resolver = new WmsTenantIdentifierResolver();
        loginAs(99L);

        assertThat(resolver.resolveCurrentTenantIdentifier()).isEqualTo(99L);
    }
}
