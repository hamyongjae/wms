package com.example.wms.auth.dto;

import com.example.wms.user.entity.User;
import com.example.wms.user.entity.UserRole;
import com.example.wms.user.entity.UserStatus;
import lombok.Getter;

import java.time.LocalDateTime;

@Getter
public class UserResponse {

    private final Long id;
    private final Long tenantId;
    private final String username;
    private final String name;
    private final UserRole role;
    private final UserStatus status;
    private final String bankName;
    private final String accountNumber;
    private final String accountHolder;
    private final LocalDateTime createdAt;

    public UserResponse(User user) {
        this.id = user.getId();
        this.tenantId = user.getTenant().getId();
        this.username = user.getUsername();
        this.name = user.getName();
        this.role = user.getRole();
        this.status = user.getStatus();
        this.bankName = user.getBankName();
        this.accountNumber = user.getAccountNumber();
        this.accountHolder = user.getAccountHolder();
        this.createdAt = user.getCreatedAt();
    }
}
