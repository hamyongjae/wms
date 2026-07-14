package com.example.wms.security;

import com.example.wms.domain.entity.User;
import com.example.wms.domain.entity.UserRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;

/**
 * JWT 발급/검증 담당.
 * 토큰 payload(claims)에 userId, tenantId, username, role 을 담아
 * 매 요청마다 DB 조회 없이 사용자를 복원할 수 있게 한다.
 */
@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final long accessTokenValidityMs;

    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-validity-ms}") long accessTokenValidityMs) {
        // application.properties의 Base64 secret을 디코딩해 HMAC 키 생성
        byte[] keyBytes = Base64.getDecoder().decode(secret);
        this.key = Keys.hmacShaKeyFor(keyBytes);
        this.accessTokenValidityMs = accessTokenValidityMs;
    }

    public String createToken(User user) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenValidityMs);

        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("tenantId", user.getTenant().getId())
                .claim("username", user.getUsername())
                .claim("role", user.getRole().name())
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)
                .compact();
    }

    /** 토큰이 유효하면 UserPrincipal로 복원, 아니면 null */
    public UserPrincipal parse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            Long userId = Long.valueOf(claims.getSubject());
            Long tenantId = claims.get("tenantId", Long.class);
            String username = claims.get("username", String.class);
            UserRole role = UserRole.valueOf(claims.get("role", String.class));

            return new UserPrincipal(userId, tenantId, username, role);
        } catch (Exception e) {
            // 만료/위조/형식오류 → 인증 실패로 처리
            return null;
        }
    }
}
