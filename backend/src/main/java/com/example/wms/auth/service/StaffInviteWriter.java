package com.example.wms.auth.service;

import com.example.wms.auth.dto.StaffInviteRequest;
import com.example.wms.auth.invite.StaffInvite;
import com.example.wms.auth.invite.StaffInviteRepository;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.tenant.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * [세션 경계 분리] 초대 생성만 담당하는 트랜잭션 경계.
 *
 * {@link StaffInviteService#invite}가 이 메서드를 호출하기 "전"에 이미
 * {@code TenantContext.runAsRoot}로 전역 중복 초대 검사를 마친 상태다. 만약 그 검사와 이 저장을
 * 같은 트랜잭션(세션) 안에 두면, Hibernate가 세션당 테넌트 식별자를 최초 1회만 확인하는 특성
 * 때문에 먼저 실행된 검사가 확정해 둔 세션 상태가 이 저장에도 그대로 이어져 예상과 다르게 동작할
 * 수 있다. 그래서 {@code StaffInviteService.invite}를 트랜잭션 없는 오케스트레이터로 두고,
 * 이 메서드만 별도 빈의 {@code @Transactional}로 완전히 새 트랜잭션에서 시작하게 분리한다.
 */
@Component
@RequiredArgsConstructor
public class StaffInviteWriter {

    private final StaffInviteRepository staffInviteRepository;
    private final TenantRepository tenantRepository;

    @Transactional
    public Long create(Long tenantId, StaffInviteRequest req) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 업체입니다. tenantId=" + tenantId));
        StaffInvite invite = new StaffInvite(tenant, req.getEmail(), req.getName(), req.getRole());
        return staffInviteRepository.save(invite).getId();
    }
}
