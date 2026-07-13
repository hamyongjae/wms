package com.example.wms.domain.dto;

import lombok.Getter;

@Getter
public class ErrorResponse {

    private final int status;      // HTTP 상태 코드 (예: 400)
    private final String message;  // 에러 메시지

    public ErrorResponse(int status, String message) {
        this.status = status;
        this.message = message;
    }
}