package com.example.wms.push.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 브라우저 PushSubscription.toJSON()의 표준 형태 그대로 받는다. */
@Getter
@NoArgsConstructor
public class PushSubscribeRequest {

    @NotBlank(message = "endpoint는 필수입니다")
    private String endpoint;

    @Valid
    private Keys keys;

    // 설정 화면에 "이 기기" 표시용(선택, 프론트에서 navigator.userAgent를 넘겨줌)
    private String userAgent;

    @Getter
    @NoArgsConstructor
    public static class Keys {
        @NotBlank(message = "p256dh는 필수입니다")
        private String p256dh;

        @NotBlank(message = "auth는 필수입니다")
        private String auth;
    }
}
