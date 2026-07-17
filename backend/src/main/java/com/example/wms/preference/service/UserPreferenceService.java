package com.example.wms.preference.service;

import com.example.wms.preference.dto.UserPreferenceResponse;
import com.example.wms.preference.entity.UserPreference;
import com.example.wms.preference.repository.UserPreferenceRepository;
import com.example.wms.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 사용자별 개인화 설정(메뉴 순서) 저장/조회.
 * [격리] 항상 로그인한 사용자(userId) 자신의 설정만 다룬다.
 */
@Service
@RequiredArgsConstructor
public class UserPreferenceService {

    private static final String DELIMITER = ",";

    private final UserPreferenceRepository repository;

    @Transactional(readOnly = true)
    public UserPreferenceResponse getMyPreference() {
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        List<String> order = repository.findByUserId(userId)
                .map(p -> split(p.getMenuOrder()))
                .orElseGet(List::of);
        return new UserPreferenceResponse(order);
    }

    /** 메뉴 순서를 upsert(있으면 갱신, 없으면 생성). */
    @Transactional
    public UserPreferenceResponse saveMenuOrder(List<String> menuOrder) {
        Long userId = SecurityUtils.getCurrentUser().getUserId();
        String csv = (menuOrder == null) ? "" : String.join(DELIMITER, menuOrder);

        UserPreference pref = repository.findByUserId(userId)
                .map(existing -> {
                    existing.updateMenuOrder(csv);
                    return existing;
                })
                .orElseGet(() -> repository.save(new UserPreference(userId, csv)));

        return new UserPreferenceResponse(split(pref.getMenuOrder()));
    }

    private List<String> split(String csv) {
        if (csv == null || csv.isBlank()) return List.of();
        return List.of(csv.split(DELIMITER));
    }
}
