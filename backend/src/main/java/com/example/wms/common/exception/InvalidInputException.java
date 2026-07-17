package com.example.wms.common.exception;

/**
 * 입력값이 유효성 규칙(정규식 등)을 위반했을 때 던지는 커스텀 예외.
 *
 * 클라이언트가 프론트 검증을 우회해 원시 API를 직접 호출하는 경우에 대비한
 * 서비스 계층 2차 방어선에서 사용한다. GlobalExceptionHandler에서 400으로 변환.
 */
public class InvalidInputException extends RuntimeException {

    public InvalidInputException(String message) {
        super(message);
    }
}
