package com.example.wms.domain.service;

import com.example.wms.domain.dto.*;
import com.example.wms.domain.entity.Customer;
import com.example.wms.domain.entity.CustomerType;
import com.example.wms.domain.entity.Tenant;
import com.example.wms.domain.repository.CustomerRepository;
import com.example.wms.domain.repository.TenantRepository;
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
        Tenant tenant = tenantRepository.findById(request.getTenantId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "존재하지 않는 업체입니다. id=" + request.getTenantId()));

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
                request.getEmergencyContactName(),
                request.getEmergencyContactPhone(),
                request.getOriginAddress(),
                request.getDestinationAddress(),
                request.getPostalCode(),
                request.isContractAgreed(),
                request.isDisposalConsent(),
                request.getMemo()
        );

        Customer saved = customerRepository.save(customer);
        return new CustomerResponse(saved);
    }

    // 특정 업체의 고객 목록 + 이름 검색 (페이징)
    @Transactional(readOnly = true)
    public Page<CustomerResponse> getCustomers(Long tenantId, String name, Pageable pageable) {
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
                request.getEmergencyContactName(),
                request.getEmergencyContactPhone(),
                request.getOriginAddress(),
                request.getDestinationAddress(),
                request.getPostalCode(),
                request.getMemo()
        );

        return new CustomerResponse(customer);
    }

    // 고객 상태 변경 (이용중 → 휴면/블랙리스트 등)
    @Transactional
    public CustomerResponse changeStatus(Long id, CustomerStatusUpdateRequest request) {
        Customer customer = findCustomerOrThrow(id);
        customer.changeStatus(request.getStatus());
        return new CustomerResponse(customer);
    }

    // 고객 삭제
    @Transactional
    public void deleteCustomer(Long id) {
        Customer customer = findCustomerOrThrow(id);
        customerRepository.delete(customer);
    }

    // 공통: id로 고객 찾고 없으면 예외
    private Customer findCustomerOrThrow(Long id) {
        return customerRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 고객입니다. id=" + id));
    }
}