package com.example.wms.auth.exception;

/**
 * 소셜 가입 계정(비밀번호 없음)으로 로컬(ID/PW) 로그인을 시도할 때 던지는 예외.
 *
 * [보안] 소셜 계정은 password가 null이다. 이 가드가 없으면
 * 빈/우회 비밀번호로 로컬 로그인을 뚫으려는 시도에 노출된다.
 * 계정 존재 여부를 흘리지 않도록 메시지는 소셜 로그인 유도로 통일한다.
 * GlobalExceptionHandler에서 401 Unauthorized로 변환된다.
 */
public class LocalLoginNotAllowedException extends RuntimeException {

    public LocalLoginNotAllowedException() {
        super("소셜 로그인으로 가입된 계정입니다. 소셜 로그인을 이용해 주세요.");
    }
}
