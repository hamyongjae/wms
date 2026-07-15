package com.example.wms.domain.repository;

import com.example.wms.domain.entity.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    // [테넌트 격리] id로 찾되 반드시 해당 tenant 소유여야만 반환.
    // 남의 tenant의 id를 넣으면 빈 값 → "없음"으로 처리되어 존재 여부조차 노출 안 됨.
    Optional<Customer> findByIdAndTenantId(Long id, Long tenantId);

    // 특정 업체의 고객 목록 (페이징)
    Page<Customer> findByTenantId(Long tenantId, Pageable pageable);

    // 특정 업체 안에서 이름으로 검색 (페이징)
    Page<Customer> findByTenantIdAndNameContaining(Long tenantId, String name, Pageable pageable);
}