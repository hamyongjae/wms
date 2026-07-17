package com.example.wms.auth.invite;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StaffInviteRepository extends JpaRepository<StaffInvite, Long> {

    // 소셜 로그인 이메일로 미수락(PENDING) 초대를 찾는다 → 케이스 B 매핑 키
    Optional<StaffInvite> findByEmailAndStatus(String email, InviteStatus status);

    boolean existsByEmailAndStatus(String email, InviteStatus status);
}
