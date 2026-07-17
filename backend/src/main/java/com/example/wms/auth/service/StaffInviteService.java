package com.example.wms.auth.service;

import com.example.wms.auth.dto.StaffInviteRequest;
import com.example.wms.auth.invite.InviteStatus;
import com.example.wms.auth.invite.StaffInvite;
import com.example.wms.auth.invite.StaffInviteRepository;
import com.example.wms.security.SecurityUtils;
import com.example.wms.tenant.entity.Tenant;
import com.example.wms.tenant.repository.TenantRepository;
import com.example.wms.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * [케이스 B] 직원 초대 등록 서비스 (ADMIN 전용).
 * 초대 회사는 요청 값이 아니라 로그인한 ADMIN의 tenant로 고정된다(위조 차단).
 */
@Service
@RequiredArgsConstructor
public class StaffInviteService {

    private final StaffInviteRepository staffInviteRepository;
    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;

    @Transactional
    public Long invite(StaffInviteRequest req) {
        Long tenantId = SecurityUtils.getCurrentTenantId();
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 업체입니다. tenantId=" + tenantId));

        // 이미 가입된 이메일은 초대 불가
        if (userRepository.existsByEmail(req.getEmail())) {
            throw new IllegalArgumentException("이미 가입된 이메일입니다: " + req.getEmail());
        }
        // 이미 대기 중 초대가 있으면 중복 발송 방지
        if (staffInviteRepository.existsByEmailAndStatus(req.getEmail(), InviteStatus.PENDING)) {
            throw new IllegalStateException("이미 대기 중인 초대가 있습니다: " + req.getEmail());
        }

        StaffInvite invite = new StaffInvite(tenant, req.getEmail(), req.getName(), req.getRole());
        return staffInviteRepository.save(invite).getId();
    }
}
