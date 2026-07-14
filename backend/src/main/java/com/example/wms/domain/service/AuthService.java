package com.example.wms.domain.service;

import com.example.wms.domain.dto.LoginRequest;
import com.example.wms.domain.dto.LoginResponse;
import com.example.wms.domain.dto.SignUpRequest;
import com.example.wms.domain.dto.UserResponse;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.entity.User;
import com.example.wms.domain.entity.UserRole;
import com.example.wms.domain.entity.UserStatus;
import com.example.wms.domain.repository.TenantRepository;
import com.example.wms.domain.repository.UserRepository;
import com.example.wms.security.JwtTokenProvider;

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
    private final JwtTokenProvider tokenProvider;

    // 직원 계정 생성
    @Transactional
    public UserResponse signUp(SignUpRequest request) {

        // 소속 업체 존재 확인
        Tenant tenant = tenantRepository.findById(request.getTenantId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. tenantId=" + request.getTenantId()));

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
