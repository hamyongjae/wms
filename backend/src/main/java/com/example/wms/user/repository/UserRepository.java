package com.example.wms.user.repository;

import com.example.wms.user.entity.LoginProvider;
import com.example.wms.user.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    // [직원 관리] 내 업체 소속 계정 목록 (최신 가입 우선)
    List<User> findAllByTenantIdOrderByCreatedAtDesc(Long tenantId);

    // [방식 1] 로그인: 아이디만으로 계정을 찾고 → 여기서 소속 tenant 를 얻는다.
    // username 은 전역 유니크 인덱스가 걸려 있어 단건 인덱스 탐색으로 조회된다.
    Optional<User> findByUsername(String username);

    // 가입 중복 검사: 시스템 전체에서 아이디 선점 여부 확인
    boolean existsByUsername(String username);

    // [소셜] (provider, providerId) 조합으로 기존 소셜 계정 조회 (재로그인 판별의 핵심 키)
    Optional<User> findByProviderAndProviderId(LoginProvider provider, String providerId);

    // 이메일 전역 중복 검사 / 조회 (자체 가입 이메일 검증, 소셜 이메일 매칭 보조)
    boolean existsByEmail(String email);

    Optional<User> findByEmail(String email);
}
