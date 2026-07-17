package com.example.wms.customer.service;

import com.example.wms.customer.dto.*;
import com.example.wms.customer.entity.Customer;
import com.example.wms.customer.entity.CustomerType;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.customer.repository.CustomerRepository;
import com.example.wms.tenant.repository.TenantRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final TenantRepository tenantRepository;

    // 고객 등록
    @Transactional
    public CustomerResponse createCustomer(CustomerCreateRequest request) {
        // [격리] 소속 업체는 클라이언트가 아니라 로그인 토큰에서 결정
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. id=" + tenantId));

        // customerType이 안 넘어오면 개인(INDIVIDUAL)으로 기본 처리
        CustomerType type = (request.getCustomerType() != null)
                ? request.getCustomerType()
                : CustomerType.INDIVIDUAL;

        Customer customer = new Customer(
                tenant,
                request.getName(),
                type,
                request.getBusinessNumber(),
                request.getPhoneNumber(),
                request.getEmail(),
                request.getMemo()
        );

        Customer saved = customerRepository.save(customer);
        return new CustomerResponse(saved);
    }

    // 내 업체의 고객 목록 + 이름 검색 (페이징)
    @Transactional(readOnly = true)
    public Page<CustomerResponse> getCustomers(String name, Pageable pageable) {
        Long tenantId = SecurityUtils.getCurrentTenantId();   // [격리] 내 tenant만
        Page<Customer> customers;
        if (name == null || name.isBlank()) {
            customers = customerRepository.findByTenantId(tenantId, pageable);
        } else {
            customers = customerRepository.findByTenantIdAndNameContaining(tenantId, name, pageable);
        }
        return customers.map(CustomerResponse::new);
    }

    // 고객 단건 조회
    @Transactional(readOnly = true)
    public CustomerResponse getCustomer(Long id) {
        Customer customer = findCustomerOrThrow(id);
        return new CustomerResponse(customer);
    }

    // 고객 정보 수정
    @Transactional
    public CustomerResponse updateCustomer(Long id, CustomerUpdateRequest request) {
        Customer customer = findCustomerOrThrow(id);

        CustomerType type = (request.getCustomerType() != null)
                ? request.getCustomerType()
                : customer.getCustomerType();   // 안 보내면 기존 값 유지

        customer.updateInfo(
                request.getName(),
                type,
                request.getBusinessNumber(),
                request.getPhoneNumber(),
                request.getEmail(),
                request.getMemo()
        );

        return new CustomerResponse(customer);
    }

    // 고객 상태 변경 (이용중 ↔ 휴면 ↔ 블랙리스트). 블랙 지정 시 사유 필수.
    @Transactional
    public CustomerResponse changeStatus(Long id, CustomerStatusUpdateRequest request) {
        Customer customer = findCustomerOrThrow(id);
        customer.applyStatus(request.getStatus(), request.getReason());
        return new CustomerResponse(customer);
    }

    // 고객 삭제
    @Transactional
    public void deleteCustomer(Long id) {
        Customer customer = findCustomerOrThrow(id);
        customerRepository.delete(customer);
    }

    // 공통: id로 고객 찾되 [격리] 내 tenant 소유일 때만.
    // 남의 고객 id를 넣어도 "존재하지 않음"으로 응답되어 데이터·존재가 노출되지 않는다.
    private Customer findCustomerOrThrow(Long id) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        return customerRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 고객입니다. id=" + id));
    }
}