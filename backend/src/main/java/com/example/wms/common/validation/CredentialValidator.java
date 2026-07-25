package com.example.wms.common.validation;

import com.example.wms.common.exception.InvalidInputException;

import java.util.regex.Pattern;

/**
 * 아이디/비밀번호 규칙을 서비스 계층 최전선에서 재검증하는 유틸.
 *
 * DTO의 @Pattern(1차)만 믿지 않고, 비즈니스 로직 진입점에서 한 번 더 검증한다
 * (원시 요청·내부 호출·테스트 우회 등 모든 경로 방어). 위반 시 InvalidInputException.
 */
public final class CredentialValidator {

    private static final Pattern USERNAME = Pattern.compile(ValidationPatterns.USERNAME);
    private static final Pattern EMAIL = Pattern.compile(ValidationPatterns.EMAIL);
    private static final Pattern PASSWORD = Pattern.compile(ValidationPatterns.PASSWORD);

    private CredentialValidator() {
    }

    /** [이메일 ID] 이메일·비밀번호를 함께 검증. 하나라도 어기면 예외. */
    public static void validate(String email, String password) {
        validateEmail(email);
        validatePassword(password);
    }

    /** 로그인 식별자(이메일) 형식 검증. */
    public static void validateEmail(String email) {
        if (email == null || !EMAIL.matcher(email).matches()) {
            throw new InvalidInputException(ValidationPatterns.EMAIL_MESSAGE);
        }
    }

    /** (레거시) 아이디 규칙 검증 — 소셜 합성 아이디 등에서만 참조. */
    public static void validateUsername(String username) {
        if (username == null || !USERNAME.matcher(username).matches()) {
            throw new InvalidInputException(ValidationPatterns.USERNAME_MESSAGE);
        }
    }

    public static void validatePassword(String password) {
        if (password == null || !PASSWORD.matcher(password).matches()) {
            throw new InvalidInputException(ValidationPatterns.PASSWORD_MESSAGE);
        }
    }
}
