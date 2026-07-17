package com.example.wms.auth.recovery;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 개발용 메일 발송 구현체 (가상 모듈).
 *
 * 실제 SMTP 없이 콘솔 로그에 재설정 링크를 출력한다.
 * 운영에서는 SmtpMailSender/SesMailSender 등을 만들어 @Primary 로 교체하면 된다.
 */
@Component
public class LoggingMailSender implements MailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingMailSender.class);

    @Override
    public void sendPasswordResetMail(String toEmail, String resetUrl) {
        log.info("""

                ===== [비밀번호 재설정 메일 - 개발용 출력] =====
                받는사람 : {}
                내용     : 아래 링크에서 15분 이내에 비밀번호를 재설정하세요.
                링크     : {}
                ============================================
                """, toEmail, resetUrl);
    }
}
