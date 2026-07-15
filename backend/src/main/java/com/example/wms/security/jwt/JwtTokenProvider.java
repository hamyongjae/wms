package com.example.wms.security.jwt;

import com.example.wms.user.entity.User;
import com.example.wms.user.entity.UserRole;
import com.example.wms.security.UserPrincipal;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;

/**
 * TokenProvider의 JWT 구현체.
 *
 * 토큰 payload(claims)에 userId, tenantId, username, role을 담아
 * 매 요청마다 DB 조회 없이 사용자를 복원한다(무상태의 핵심).
 */
@Component
public class JwtTokenProvider implements TokenProvider {

    private final SecretKey key;
    private final long accessTokenValidityMs;

    /**
     * [보안] secret은 코드에 하드코딩하지 않고 application.yml에서 @Value로 주입.
     * 운영에서는 yml의 ${JWT_SECRET} 자리에 환경변수로 실제 키를 넣는다.
     */
    public JwtTokenProvider(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-validity-ms}") long accessTokenValidityMs) {

        // Base64 문자열을 디코딩해 HMAC-SHA 키 생성 (최소 256bit 필요)
        byte[] keyBytes = Base64.getDecoder().decode(secret);
        this.key = Keys.hmacShaKeyFor(keyBytes);   // 최신 JJWT 스펙 방식
        this.accessTokenValidityMs = accessTokenValidityMs;
    }

    @Override
    public String createToken(User user) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenValidityMs);

        return Jwts.builder()
                .subject(String.valueOf(user.getId()))     // 표준 sub 클레임 = userId
                .claim("tenantId", user.getTenant().getId())
                .claim("username", user.getUsername())
                .claim("role", user.getRole().name())
                .issuedAt(now)
                .expiration(expiry)
                .signWith(key)          // 서명 → 위조 방지
                .compact();
    }

    @Override
    public UserPrincipal parse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)               // 서명 검증
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            Long userId = Long.valueOf(claims.getSubject());
            Long tenantId = claims.get("tenantId", Long.class);
            String username = claims.get("username", String.class);
            UserRole role = UserRole.valueOf(claims.get("role", String.class));

            return new UserPrincipal(userId, tenantId, username, role);
        } catch (Exception e) {
            // 만료/위조/형식오류 → 인증 실패로 처리 (null)
            return null;
        }
    }
}
