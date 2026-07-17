package com.example.wms.preference.dto;

import lombok.Getter;

import java.util.List;

/** 개인화 설정 응답. */
@Getter
public class UserPreferenceResponse {

    private final List<String> menuOrder;

    public UserPreferenceResponse(List<String> menuOrder) {
        this.menuOrder = menuOrder;
    }
}
