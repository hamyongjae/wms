package com.example.wms.auth.service;

import com.example.wms.auth.dto.CompanyRegisterRequest;
import com.example.wms.auth.dto.LoginRequest;
import com.example.wms.auth.dto.LoginResponse;
import com.example.wms.auth.dto.SignUpRequest;
import com.example.wms.auth.dto.UserResponse;
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

        // 사업자번호 중복 검사
        if (tenantRepository.existsByBusinessNumber(request.getBusinessNumber())) {
            throw new IllegalArgumentException(
                    "이미 등록된 사업자번호입니다: " + request.getBusinessNumber());
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

    // 직원/관리자 계정 생성 — ADMIN이 "자기 회사"에만 추가 (tenantId는 토큰에서 결정)
    @Transactional
    public UserResponse signUp(SignUpRequest request) {

        // [격리] 소속 업체는 요청 값이 아니라 로그인한 ADMIN의 tenant로 고정
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. tenantId=" + tenantId));

        // 같은 업체 안에서 아이디 중복 검사
        if (userRepository.existsByTenantIdAndUsername(tenant.getId(), request.getUsername())) {
            throw new IllegalArgumentException("이미 사용 중인 아이디입니다: " + request.getUsername());
        }

        // 비밀번호는 반드시 해시해서 저장
        String encodedPassword = passwordEncoder.encode(request.getPassword());
        UserRole role = (request.getRole() != null) ? request.getRole() : UserRole.STAFF;

        User user = new User(tenant, request.getUsername(), encodedPassword,
                request.getName(), role);

        User saved = userRepository.save(user);
        return new UserResponse(saved);
    }

    // 로그인 → JWT 발급
    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {

        // 존재하지 않는 아이디여도 "아이디/비번 불일치"로 통일 (계정 존재 여부 노출 방지)
        User user = userRepository
                .findByTenantIdAndUsername(request.getTenantId(), request.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new IllegalArgumentException("비활성화된 계정입니다.");
        }

        String token = tokenProvider.createToken(user);
        return new LoginResponse(token, user);
    }

    // 내 정보 조회 (토큰의 userId 기준)
    @Transactional(readOnly = true)
    public UserResponse getMe(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 사용자입니다. id=" + userId));
        return new UserResponse(user);
    }
}
