package com.example.wms.auth.service;

import com.example.wms.auth.dto.CompanyRegisterRequest;
import com.example.wms.auth.dto.LoginRequest;
import com.example.wms.auth.dto.LoginResponse;
import com.example.wms.auth.dto.SignUpRequest;
import com.example.wms.auth.dto.UserResponse;
import com.example.wms.auth.exception.DuplicateUsernameException;
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

        // [2차 방어] 프론트 검증을 우회한 원시 요청 대비 — 서비스 최전선에서 규칙 재검증
        CredentialValidator.validate(request.getAdminUsername(), request.getAdminPassword());

        // 사업자번호 중복 검사
        if (tenantRepository.existsByBusinessNumber(request.getBusinessNumber())) {
            throw new IllegalArgumentException(
                    "이미 등록된 사업자번호입니다: " + request.getBusinessNumber());
        }

        // [방식 1] 마스터 아이디는 시스템 전체에서 유일해야 한다 (전 테넌트 대상 선점 검사)
        if (userRepository.existsByUsername(request.getAdminUsername())) {
            throw new DuplicateUsernameException(request.getAdminUsername());
        }

        // 1) 회사(Tenant) 생성
        Tenant tenant = new Tenant(
                request.getCompanyName(),
                request.getBusinessNumber(),
                request.getCeoName(),
                request.getPhone(),
                request.getEmail(),
                request.getAddress());
        Tenant savedTenant = tenantRepository.save(tenant);

        // 2) 첫 계정을 ADMIN으로 생성 (비밀번호 해시 저장)
        String encodedPassword = passwordEncoder.encode(request.getAdminPassword());
        User admin = new User(savedTenant, request.getAdminUsername(), encodedPassword,
                request.getAdminName(), UserRole.ADMIN);
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
        // [2차 방어] 아이디/비밀번호 규칙 재검증 (프론트 우회 대비)
        CredentialValidator.validate(request.getUsername(), request.getPassword());

        Long tenantId = SecurityUtils.getCurrentTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. tenantId=" + tenantId));

        // [방식 1] 아이디는 전 시스템에서 유일해야 하므로 전역 중복 검사
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new DuplicateUsernameException(request.getUsername());
        }

        // 비밀번호는 반드시 해시해서 저장
        String encodedPassword = passwordEncoder.encode(request.getPassword());
        UserRole role = (request.getRole() != null) ? request.getRole() : UserRole.STAFF;

        User user = new User(tenant, request.getUsername(), encodedPassword,
                request.getName(), role);

        User saved = userRepository.save(user);
        return new UserResponse(saved);
    }

    // [방식 1] 로그인 → 아이디만으로 계정을 찾고, 그 계정의 tenant/role을 토큰에 담아 발급
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {

        // 존재하지 않는 아이디여도 "아이디/비번 불일치"로 통일 (계정 존재 여부 노출 방지)
        User user = userRepository
                .findByUsername(request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다."));

        // [보안] 소셜 계정(비번 null)의 로컬 로그인 우회 차단 — 비밀번호 매칭 이전에 먼저 방어
        if (!user.canLoginWithPassword()) {
            throw new LocalLoginNotAllowedException();
        }

        if (!passwordEncoder.matches(request.getPass