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
    // username 은 전역 유니크 인덱스가 걸려 있어 단건 �