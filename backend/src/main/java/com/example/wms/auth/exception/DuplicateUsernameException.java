package com.example.wms.auth.exception;

/**
 * 이미 시스템에 존재하는 아이디로 가입을 시도할 때 던지는 예외.
 *
 * [방식 1] username 은 전 테넌트를 통틀어 유일해야 하므로,
 * 회사 등록(register-company)과 직원 추가(signup-staff) 양쪽 모두
 * 저장 전 이 예외로 선점 여부를 검증한다.
 * GlobalExceptionHandler 에서 409 Conflict 로 변환된다.
 */
public class DuplicateUsernameException extends RuntimeException {

    public DuplicateUsernameException(String username) {
        super("이미 사용 중인 아이디입니다: " + username);
    }
}
