package com.example.wms.auth.service;

import com.example.wms.auth.dto.CompanyProfileRequest;
import com.example.wms.auth.dto.LoginResponse;
import com.example.wms.auth.invite.InviteStatus;
import com.example.wms.auth.invite.StaffInvite;
import com.example.wms.auth.invite.StaffInviteRepository;
import com.example.wms.auth.oauth.OAuth2UserInfo;
import com.example.wms.auth.oauth.OAuth2UserInfoFactory;
import com.example.wms.security.jwt.TokenProvider;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.tenant.repository.TenantRepository;
import com.example.wms.user.entity.LoginProvider;
import com.example.wms.user.entity.User;
import com.example.wms.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

/**
 * 소셜 로그인/가입 통합 처리 서비스.
 *
 * [통합 진입점] 실제 운영에서는 Spring Security OAuth2 로그인 성공 핸들러가
 *   provider별 응답을 받아 이 서비스의 loginOrRegister(provider, attributes)를 호출한다.
 *   (본 서비스는 OAuth2 클라이언트 세부에 의존하지 않고, 파싱은 OAuth2UserInfo 추상화에 위임)
 *
 * [가입 전환 흐름]
 *  - 재로그인      : (provider, providerId)로 기존 계정을 찾으면 그대로 토큰 발급.
 *  - 케이스 B(초대): 최초 진입이지만 이메일에 PENDING 초대가 있으면 해당 tenant에 STAFF로 즉시 매핑.
 *  - 케이스 A(신규): 초대가 없으면 tenant 미지정(PENDING) 유저로 저장 → 프론트가 '회사 등록'으로 유도.
 */
@Service
@RequiredArgsConstructor
public class SocialAuthService {

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final StaffInviteRepository staffInviteRepository;
    private final TokenProvider tokenProvider;

    /**
     * 소셜 인증 결과(원시 attributes)를 받아 로그인 또는 (미완성) 가입까지 처리하고 토큰을 반환.
     * 반환된 LoginResponse.registrationComplete == false 이면 프론트는 회사 등록 페이지로 보낸다(케이스 A).
     */
    @Transactional
    public LoginResponse loginOrRegister(LoginProvider provider, Map<String, Object> attributes) {

        // 1) 플랫폼별 응답을 공통 규격으로 흡수 (구현체는 팩토리가 선택)
        OAuth2UserInfo info = OAuth2UserInfoFactory.of(provider, attributes);

        if (info.getProviderId() == null) {
            throw new IllegalArgumentException("소셜 응답에 사용자 식별자(providerId)가 없습니다.");
        }

        // 2) 재로그인: 이미 존재하는 소셜 계정이면 그대로 발급 (완성/미완성 상태 그대로 반영)
        Optional<User> existing =
                userRepository.findByProviderAndProviderId(info.getProvider(), info.getProviderId());
        if (existing.isPresent()) {
            return issue(existing.get());
        }

        // 3) 최초 진입 — 이메일이 다른 방식으로 이미 선점됐는지 확인(계정 혼선/탈취 방지)
        String email = info.getEmail();
        if (email != null && userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException(
                    "이미 다른 방식으로 가입된 이메일입니다: " + email);
        }

        // 4) 케이스 B(직원 초대): 이메일에 PENDING 초대가 있으면 그 회사에 STAFF로 즉시 매핑
        if (email != null) {
            Optional<StaffInvite> invite =
                    staffInviteRepository.findByEmailAndStatus(email, InviteStatus.PENDING);
            if (invite.isPresent()) {
                StaffInvite inv = invite.get();
                User staff = User.pendingSocialUser(
                        info.getProvider(), info.getProviderId(), email, resolveName(info));
                staff.bindTenantAsStaff(inv.getTenant());   // tenant 상속 + STAFF + ACTIVE
                User savedStaff = userRepository.save(staff);
                inv.accept();                                // 초대 소진
                return issue(savedStaff);
            }
        }

        // 5) 케이스 A(신규 사장 후보): tenant 미지정(PENDING) 유저로 저장 → 회사 등록 유도
        User pending = User.pendingSocialUser(
                info.getProvider(), info.getProviderId(), email, resolveName(info));
        User savedPending = userRepository.save(pending);
        return issue(savedPending);
    }

    /**
     * [케이스 A] PENDING 유저가 회사를 등록하며 가입을 완료(ADMIN 승격).
     * 토큰을 새로 발급해 이제 tenantId가 포함된 토큰으로 교체한다.
     */
    @Transactional
    public LoginResponse completeCompanyRegistration(Long userId, CompanyProfileRequest req) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 사용자입니다. id=" + userId));

        if (user.isRegistrationComplete()) {
            throw new IllegalStateException("이미 소속 업체가 있는 계정입니다.");
        }

        if (tenantRepository.existsByBusinessNumber(req.getBusinessNumber())) {
            throw new IllegalArgumentException(
                    "이미 등록된 사업자번호입니다: " + req.getBusinessNumber());
        }

        Tenant tenant = new Tenant(
                req.getCompanyName(), req.getBusinessNumber(), req.getCeoName(),
                req.getPhone(), req.getEmail(), req.getAddress());
        Tenant savedTenant = tenantRepository.save(tenant);

        user.bindTenantAsAdmin(savedTenant);   // tenant 지정 + ADMIN + ACTIVE
        return issue(user);
    }

    // ===================== 내부 =====================

    private LoginResponse issue(User user) {
        String token = tokenProvider.createToken(user);
        return new LoginResponse(token, user);
    }

    // 소셜에서 이름 미제공 시 최소한의 표시명 보장
    private String resolveName(OAuth2UserInfo info) {
        return (info.getName() != null && !info.getName().isBlank())
                ? info.getName()
                : info.getProvider().name() + " 사용자";
    }
}
