package com.example.wms.auth.recovery;

import com.example.wms.auth.recovery.dto.FindUsernameRequest;
import com.example.wms.auth.recovery.dto.FindUsernameResponse;
import com.example.wms.auth.recovery.dto.PasswordResetConfirmRequest;
import com.example.wms.auth.recovery.dto.PasswordResetRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 계정 회복 API (전부 공개 — 비로그인 사용자가 쓴다).
 *
 * 경로: /api/auth/recovery/**  (SecurityConfig에서 permitAll)
 */
@RestController
@RequestMapping("/api/auth/recovery")
@RequiredArgsConstructor
public class AccountRecoveryController {

    private final AccountRecoveryService recoveryService;

    // 아이디 찾기 — 마스킹된 아이디 반환
    @PostMapping("/find-username")
    public ResponseEntity<FindUsernameResponse> findUsername(
            @Valid @RequestBody FindUsernameRequest request) {
        return ResponseEntity.ok(recoveryService.findUsername(request.getName(), request.getEmail()));
    }

    // 비밀번호 재설정 요청 (메일 발송)
    // [보안] 계정 존재 여부와 무관하게 항상 동일한 200 응답 → 회원 열거 방지
    @PostMapping("/password/request")
    public ResponseEntity<Map<String, String>> requestReset(
            @Valid @RequestBody PasswordResetRequest request) {
        recoveryService.requestPasswordReset(request.getEmail());
        return ResponseEntity.ok(Map.of(
                "message", "입력하신 정보가 일치하면 등록된 이메일로 재설정 링크를 보냈습니다."));
    }

    // 비밀번호 재설정 확정 (토큰 + 새 비밀번호)
    @PostMapping("/password/confirm")
    public ResponseEntity<Map<String, String>> confirmReset(
            @Valid @RequestBody PasswordResetConfirmRequest request) {
        recoveryService.confirmPasswordReset(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(Map.of(
                "message", "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요."));
    }
}
