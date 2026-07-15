package com.example.wms.security;

import com.example.wms.user.entity.User;
import com.example.wms.user.entity.UserRole;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/**
 * SecurityContext에 담기는 로그인 사용자 정보.
 * 컨트롤러에서 @AuthenticationPrincipal UserPrincipal 로 꺼내 쓴다.
 * 특히 getTenantId() 는 이후 테넌트 데이터 격리의 핵심.
 */
public class UserPrincipal implements UserDetails {

    private final Long userId;
    private final Long tenantId;
    private final String username;
    private final UserRole role;

    public UserPrincipal(Long userId, Long tenantId, String username, UserRole role) {
        this.userId = userId;
        this.tenantId = tenantId;
        this.username = username;
        this.role = role;
    }

    public static UserPrincipal from(User user) {
        return new UserPrincipal(
                user.getId(),
                user.getTenant().getId(),
                user.getUsername(),
                user.getRole());
    }

    public Long getUserId() {
        return userId;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public UserRole getRole() {
        return role;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // Spring Security 관례상 ROLE_ 접두사를 붙인다 (hasRole('ADMIN') 대응)
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getPassword() {
        return null;   // 토큰 기반이라 비밀번호는 담지 않음
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}
