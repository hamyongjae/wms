package com.example.wms.common.validation;

/**
 * 회원가입 입력 검증에 쓰는 표준 정규식 상수 모음.
 *
 * [단일 기준] 프론트엔드와 백엔드가 "같은 규칙"으로 검증해야 하므로,
 * 규칙(정규식/메시지)을 여기 한 곳에 못박아 DTO의 @Pattern과
 * 서비스 계층 재검증(CredentialValidator)이 모두 참조한다.
 *
 * @Pattern(regexp = ...) 는 컴파일 타임 상수만 받으므로 public static final String 으로 둔다.
 */
public final class ValidationPatterns {

    private ValidationPatterns() {
    }

    /**
     * 아이디: 영문 소문자 + 숫자, 4~20자.
     * 한글/대문자/특수문자/공백은 불허.
     */
    public static final String USERNAME = "^[a-z0-9]{4,20}$";

    /**
     * 비밀번호: 영문(대/소 무관) + 숫자 + 특수문자를 각 1개 이상 포함, 8~20자.
     * (자바 문자열이라 역슬래시는 이스케이프됨)
     */
    public static final String PASSWORD =
            "^(?=.*[a-zA-Z])(?=.*\\d)(?=.*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?]).{8,20}$";

    /**
     * 이메일: 로그인 식별자(아이디)로 사용. 공백 없는 local@domain.tld 형태.
     * (자바 문자열 이스케이프 반영)
     */
    public static final String EMAIL = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";

    // 사용자에게 보여줄 표준 안내 메시지
    public static final String USERNAME_MESSAGE = "아이디는 영문 소문자와 숫자만으로 4~20자여야 합니다.";
    public static final String EMAIL_MESSAGE = "이메일 형식이 올바르지 않습니다.";
    public static final String PASSWORD_MESSAGE = "비밀번호는 영문, 숫자, 특수문자를 포함해 8~20자여야 합니다.";
}
