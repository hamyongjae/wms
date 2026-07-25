package com.example.wms.auth.service;

import com.example.wms.auth.dto.CompanyRegisterRequest;
import com.example.wms.auth.dto.LoginRequest;
import com.example.wms.auth.dto.LoginResponse;
import com.example.wms.auth.dto.SignUpRequest;
import com.example.wms.auth.dto.UserResponse;
import com.example.wms.auth.exception.LocalLoginNotAllowedException;
import com.example.wms.common.validation.CredentialValidator;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.user.entity.User;
import com.example.wms.user.entity.UserRole;
import com.example.wms.user.entity.UserStatus;
import com.example.wms.tenant.repository.TenantRepository;
import com.example.wms.user.repository.UserRepository;
import com.example.wms.security.SecurityUtils;
import com.example.wms.security.jwt.TokenProvider;

import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenProvider tokenProvider;   // 인터페이스에 의존 (구현체 교체 자유)

    // 신규 업체 셀프 가입: 회사 + 첫 관리자(ADMIN)를 한 번에 생성 (공개)
    @Transactional
    public LoginResponse registerCompany(CompanyRegisterRequest request) {

        // [이메일 ID] 로그인 아이디 = 이메일. 서비스 최전선에서 이메일·비밀번호 규칙 재검증(프론트 우회 대비)
        String adminEmail = request.getEmail() != null ? request.getEmail().trim() : null;
        CredentialValidator.validate(adminEmail, request.getAdminPassword());

        // 사업자번호 중복 검사
        if (tenantRepository.existsByBusinessNumber(request.getBusinessNumber())) {
            throw new IllegalArgumentException(
                    "이미 등록된 사업자번호입니다: " + request.getBusinessNumber());
        }

        // [유일 식별자] 이메일은 시스템 전체에서 유일해야 한다 (로그인·계정찾기의 키)
        if (userRepository.existsByEmail(adminEmail)) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다: " + adminEmail);
        }

        // 1) 회사(Tenant) 생성
        Tenant tenant = new Tenant(
                request.getCompanyName(),
                request.getBusinessNumber(),
                request.getCeoName(),
                request.getPhone(),
                adminEmail,
                request.getAddress());
        Tenant savedTenant = tenantRepository.save(tenant);

        // 2) 첫 계정을 ADMIN으로 생성 — 아이디(username)와 이메일 모두 이메일로 저장(로그인 식별자 일원화)
        String encodedPassword = passwordEncoder.encode(request.getAdminPassword());
        User admin = User.localUser(savedTenant, adminEmail, encodedPassword,
                request.getAdminName(), adminEmail, UserRole.ADMIN);
        User savedAdmin = userRepository.save(admin);

        // 3) 바로 로그인된 상태가 되도록 토큰 발급해서 반환
        String token = tokenProvider.createToken(savedAdmin);
        return new LoginResponse(token, savedAdmin);
    }

    // 직원 계정 생성 — 로그인한 ADMIN이 "자기 회사"에만 추가
    // [보안 상속] tenantId는 요청 본문이 아니라 토큰(SecurityContext)에서 추출해
    //   새 직원에게 그대로 바인딩한다. 직원이 소속 회사를 임의 지정/조작할 여지를 원천 차단.
    @Transactional
    public UserResponse signUpStaff(SignUpRequest request) {

        // [격리] 소속 업체는 요청 값이 아니라 로그인한 ADMIN의 tenant로 고정
        // [이메일 ID] 이메일·비밀번호 규칙 재검증 (프론트 우회 대비)
        String email = request.getEmail() != null ? request.getEmail().trim() : null;
        CredentialValidator.validate(email, request.getPassword());

        Long tenantId = SecurityUtils.getCurrentTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. tenantId=" + tenantId));

        // [유일 식별자] 이메일은 전 시스템에서 유일해야 하므로 전역 중복 검사
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("이미 사용 중인 이메일입니다: " + email);
        }

        // 비밀번호는 반드시 해시해서 저장. 아이디(username)·이메일 모두 이메일로 저장(로그인 식별자 일원화).
        String encodedPassword = passwordEncoder.encode(request.getPassword());
        UserRole role = (request.getRole() != null) ? request.getRole() : UserRole.STAFF;

        User user = User.localUser(tenant, email, encodedPassword, request.getName(), email, role);

        User saved = userRepository.save(user);
        return new UserResponse(saved);
    }

    // [이메일 ID] 로그인 → 이메일로 계정을 찾고, 그 계정의 tenant/role을 토큰에 담아 발급
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {

        // 존재하지 않는 이메일이어도 "이메일/비번 불일치"로 통일 (계정 존재 여부 노출 방지)
        User user = userRepository
                .findByEmail(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다."));

        // [보안] 소셜 계정(비번 null)의 로컬 로그인 우회 차단 — 비밀번호 매칭 이전에 먼저 방어
        if (!user.canLoginWithPassword()) {
            throw new LocalLoginNotAllowedException();
        }

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new IllegalArgumentException("비활성화된 계정입니다.");
        }

        String token = tokenProvider.createToken(user);
        return new LoginResponse(token, user);
    }

    // 내 업체 소속 계정(직원/관리자) 목록 — ADMIN 전용 조회
    @Transactional(readOnly = true)
    public java.util.List<UserResponse> listStaff() {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return userRepository.findAllByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .map(UserResponse::new)
                .toList();
    }

    // [계좌 등록] 직원 주거래 계좌 등록·수정 — ADMIN 전용, 내 업체 소속만
    @Transactional
    public UserResponse updateStaffAccount(Long userId, com.example.wms.auth.dto.StaffAccountRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        User user = userRepository.findById(userId)
                .filter(u -> u.getTenant() != null && u.getTenant().getId().equals(tenantId))
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 직원입니다. id=" + userId));
        user.updateAccount(req.getBankName(), req.getAccountNumber(), req.getAccountHolder());
        return new UserResponse(user);
    }

    // 내 정보 조회 (토큰의 userId 기준)
    @Transactional(readOnly = true)
    public UserResponse getMe(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 사용자입니다. id=" + userId));
        return new UserResponse(user);
    }
}
