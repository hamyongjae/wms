package com.example.wms.preference.controller;

import com.example.wms.preference.dto.MenuOrderRequest;
import com.example.wms.preference.dto.UserPreferenceResponse;
import com.example.wms.preference.service.UserPreferenceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * 사용자 개인화 설정 API (로그인 사용자 본인).
 */
@RestController
@RequestMapping("/api/preferences")
@RequiredArgsConstructor
public class UserPreferenceController {

    private final UserPreferenceService preferenceService;

    // 내 개인화 설정 조회
    @GetMapping("/me")
    public ResponseEntity<UserPreferenceResponse> getMyPreference() {
        return ResponseEntity.ok(preferenceService.getMyPreference());
    }

    // 메뉴 순서 저장 (드래그앤드롭 완료 시 프론트가 호출)
    @PutMapping("/me/menu-order")
    public ResponseEntity<UserPreferenceResponse> saveMenuOrder(
            @Valid @RequestBody MenuOrderRequest request) {
        return ResponseEntity.ok(preferenceService.saveMenuOrder(request.getMenuOrder()));
    }
}
