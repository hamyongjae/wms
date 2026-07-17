package com.example.wms.auth.recovery.dto;

import lombok.Getter;

/**
 * 아이디 찾기 응답.
 * found=true일 때만 maskedUsername(뒷자리 마스킹)을 담는다.
 */
@Getter
public class FindUsernameResponse {

    private final boolean found;
    private final String maskedUsername;
    private final String message;

    public FindUsernameResponse(boolean found, String maskedUsername, String message) {
        this.found = found;
        this.maskedUsername = maskedUsername;
        this.message = message;
    }

    public static FindUsernameResponse found(String maskedUsername) {
        return new FindUsernameResponse(true, maskedUsername, "일치하는 계정을 찾았습니다.");
    }

    public static FindUsernameResponse notFound() {
        return new FindUsernameResponse(false, null, "입력하신 정보와 일치하는 계정이 없습니다.");
    }
}
