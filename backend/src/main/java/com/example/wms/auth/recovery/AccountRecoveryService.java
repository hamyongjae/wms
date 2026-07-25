package com.example.wms.auth.recovery;

import com.example.wms.auth.recovery.dto.FindUsernameResponse;
import com.example.wms.common.exception.InvalidInputException;
import com.example.wms.common.validation.CredentialValidator;
import com.example.wms.user.entity.LoginProvider;
import com.example.wms.user.entity.User;
import com.example.wms.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

/**
 * 계정 회복(아이디 찾기 / 비밀번호 재설정) 비즈니스 로직.
 *
 * [보안 원칙]
 * - 아이디는 뒷자리를 마스킹해 일부만 노출한다.
 * - 비밀번호 재설정 요청은 계정 존재 여부와 무관하게 "항상 동일한 응답"을 준다
 *   (회원 존재 여부를 어뷰저가 알아내는 열거(enumeration) 공격 차단). 실제 메일은 일치할 때만 발송.
 * - 재설정 토큰은 UUID·일회용·15분 만료.
 * - 자체 로그인(LOCAL) 계정만 대상 — 소셜 계정은 비밀번호 개념이 없다.
 */
@Service
@RequiredArgsConstructor
public class AccountRecoveryService {

    private static final long RESET_TOKEN_TTL_MINUTES = 15;

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final MailSender mailSender;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    // ===================== 아이디 찾기 =====================

    /** 이름+이메일로 조회 → 마스킹된 아이디 반환(자체 가입 계정만). */
    @Transactional(readOnly = true)
    public FindUsernameResponse findUsername(String name, String email) {
        return userRepository.findByNameAndEmail(name, email)
                .filter(u -> u.getProvider() == LoginProvider.LOCAL)
                .map(u -> FindUsernameResponse.found(mask(u.getUsername())))
                .orElseGet(FindUsernameResponse::notFound);
    }

    // ===================== 비밀번호 재설정 요청 =====================

    /**
     * [이메일 ID] 이메일(=로그인 아이디)로 계정을 찾아 재설정 토큰을 만들어 메일 발송.
     * [보안] 존재 여부와 무관하게 호출부는 동일 응답을 반환하므로,
     *   여기서는 조용히 처리하고 일치할 때만 실제 메일을 보낸다.
     */
    @Transactional
    public void requestPasswordReset(String email) {
        Optional<User> match = userRepository.findByEmail(email)
                .filter(u -> u.getProvider() == LoginProvider.LOCAL);

        if (match.isEmpty()) {
            return; // 조용히 종료 (열거 공격 방지 — 응답은 호출부가 동일하게 준다)
        }

        User user = match.get();
        String token = UUID.randomUUID().toString();
        LocalDateTime expiresAt = LocalDateTime.now().plusMinutes(RESET_TOKEN_TTL_MINUTES);
        tokenRepository.save(new PasswordResetToken(token, user.getId(), expiresAt));

        String resetUrl = frontendBaseUrl + "/reset-password?token=" + token;
        mailSender.sendPasswordResetMail(user.getEmail(), resetUrl);
    }

    // ===================== 비밀번호 재설정 확정 =====================

    /** 토큰 검증 후 새 비밀번호로 안전하게 교체(해싱). */
    @Transactional
    public void confirmPasswordReset(String token, String newPassword) {
        PasswordResetToken prt = tokenRepository.findByToken(token)
                .orElseThrow(() -> new InvalidInputException("유효하지 않은 재설정 링크입니다."));

        if (!prt.isUsable()) {
            throw new InvalidInputException("만료되었거나 이미 사용된 재설정 링크입니다. 다시 요청해 주세요.");
        }

        // [2차 방어] 비밀번호 규칙 재검증 (DTO @Pattern 우회 대비)
        CredentialValidator.validatePassword(newPassword);

        User user = userRepository.findById(prt.getUserId())
                .orElseThrow(() -> new InvalidInputException("대상 계정을 찾을 수 없습니다."));

        user.changePassword(passwordEncoder.encode(newPassword));
        prt.markUsed();
    }

    // ===================== 유틸 =====================

    /** 아이디 뒷자리 마스킹: 앞 최대 4자만 노출하고 나머지는 ***. (예: hanyongjae → hany***) */
    private String mask(String username) {
        int len = username.length();
        int reveal = Math.min(4, Math.max(1, len - 2));
        return username.substring(0, Math.min(reveal, len)) + "***";
    }
}
