package com.example.wms.user.repository;

import com.example.wms.user.entity.User;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    // 로그인 시 tenant + username 조합으로 계정 조회
    Optional<User> findByTenantIdAndUsername(Long tenantId, String username);

    // 같은 tenant 안에 아이디가 이미 있는지 확인 (가입 중복 검사)
    boolean existsByTenantIdAndUsername(Long tenantId, String username);
}
