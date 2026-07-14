package com.example.wms.domain.repository;

import com.example.wms.domain.entity.Customer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    // 특정 업체의 고객 목록 (페이징)
    Page<Customer> findByTenantId(Long tenantId, Pageable pageable);

    // 특정 업체 안에서 이름으로 검색 (페이징)
    Page<Customer> findByTenantIdAndNameContaining(Long tenantId, String name, Pageable pageable);
}