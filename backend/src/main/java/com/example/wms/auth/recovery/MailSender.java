package com.example.wms.auth.recovery;

/**
 * 메일 발송 추상화.
 *
 * [확장성] 실제 발송 방식(SMTP, SES, 외부 API 등)이 바뀌어도
 * 서비스는 이 인터페이스에만 의존한다. 새 구현체로 갈아끼우면 끝.
 */
public interface MailSender {

    /**
     * 비밀번호 재설정 링크 메일 발송.
     *
     * @param toEmail  수신 이메일
     * @param resetUrl 재설정 페이지 URL (토큰 포함)
     */
    void sendPasswordResetMail(String toEmail, String resetUrl);
}
