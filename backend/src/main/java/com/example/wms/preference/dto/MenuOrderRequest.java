package com.example.wms.preference.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.List;

/** 메뉴 순서 저장 요청 — 라우트 키 배열. */
@Getter
@NoArgsConstructor
public class MenuOrderRequest {

    @NotNull(message = "메뉴 순서는 필수입니다")
    private List<String> menuOrder;
}
