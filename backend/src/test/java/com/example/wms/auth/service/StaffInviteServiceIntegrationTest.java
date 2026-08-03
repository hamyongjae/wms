package com.example.wms.auth.service;

import com.example.wms.auth.dto.StaffInviteRequest;
import com.example.wms.support.IntegrationTestBase;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.user.entity.UserRole;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * ===== [직원 초대 전역 중복 검사 회귀 테스트] =====
 *
 * {@link StaffInviteService#invite}의 "이미 대기 중인 초대가 있는지" 검사는
 * {@code TenantContext.runAsRoot}로 테넌트 필터를 끄고 시스템 전체를 봐야 의미가 있다(다른
 * 업체가 이미 초대한 이메일을 걸러내는 게 목적). 청구 배치와 같은 근본 원인(Hibernate가 세션당
 * 테넌트 식별자를 최초 1회만 확인)으로 이 전역 검사가 조용히 "내 회사 안에서만" 검사하도록
 * 축소돼 있었던 걸 고쳤다 — A업체가 만든 대기 중 초대를 B업체가 같은 이메일로 다시 초대하려
 * 하면 실제로 막히는지 직접 확인한다.
 *
 * [트랜잭션 경계] 한 메서드 안에서 A/B 두 업체로 번갈아 로그인해야 해서 NOT_SUPPORTED로
 * 오버라이드한다(이유는 TenantIsolationIntegrationTest 클래스 주석 참고).
 */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class StaffInviteServiceIntegrationTest extends IntegrationTestBase {

    @Autowired
    private StaffInviteService staffInviteService;

    @Test
    @DisplayName("[회귀] A업체가 초대한 이메일을 B업체가 같은 이메일로 다시 초대하면 전역 중복으로 막힌다")
    void blocksDuplicateInviteAcrossTenants() {
        Tenant tenantA = createTenant("A업체-초대");
        Tenant tenantB = createTenant("B업체-초대");
        String email = "duplicate-invite-" + System.nanoTime() + "@example.com";

        loginAs(tenantA.getId(), UserRole.ADMIN);
        assertThatCode(() -> staffInviteService.invite(inviteRequest(email, UserRole.STAFF)))
                .doesNotThrowAnyException();

        loginAs(tenantB.getId(), UserRole.ADMIN);
        assertThatThrownBy(() -> staffInviteService.invite(inviteRequest(email, UserRole.STAFF)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("이미 대기 중인 초대가 있습니다");
    }

    @Test
    @DisplayName("서로 다른 이메일이면 다른 업체가 초대해도 정상 생성된다")
    void allowsDistinctEmailsAcrossTenants() {
        Tenant tenantA = createTenant("A업체-초대2");
        Tenant tenantB = createTenant("B업체-초대2");

        loginAs(tenantA.getId(), UserRole.ADMIN);
        assertThatCode(() -> staffInviteService.invite(
                inviteRequest("invite-a-" + System.nanoTime() + "@example.com", UserRole.STAFF)))
                .doesNotThrowAnyException();

        loginAs(tenantB.getId(), UserRole.ADMIN);
        assertThatCode(() -> staffInviteService.invite(
                inviteRequest("invite-b-" + System.nanoTime() + "@example.com", UserRole.STAFF)))
                .doesNotThrowAnyException();
    }

    private StaffInviteRequest inviteRequest(String email, UserRole role) {
        StaffInviteRequest req = new StaffInviteRequest();
        ReflectionTestUtils.setField(req, "email", email);
        ReflectionTestUtils.setField(req, "name", "테스트직원");
        ReflectionTestUtils.setField(req, "role", role);
        return req;
    }
}
