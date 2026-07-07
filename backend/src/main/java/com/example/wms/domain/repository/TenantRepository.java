package com.example.wms.domain.repository;

import com.example.wms.domain.entity.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface TenantRepository extends JpaRepository<Tenant, Long> {

    // 사업자번호로 업체 조회 (중복 확인용)
    Optional<Tenant> findByBusinessNumber(String businessNumber);

    // 사업자번호가 이미 존재하는지 여부만 확인
    boolean existsByBusinessNumber(String businessNumber);
}