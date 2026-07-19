package com.example.wms.auth.recovery;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Primary;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * [운영] 실제 SMTP 메일 발송 구현체.
 *
 * spring.mail.username 이 설정된 경우에만 활성화되어 @Primary 로 LoggingMailSender를 대체한다.
 * (미설정 시 이 빈이 생성되지 않아 개발용 콘솔 발송으로 자연스럽게 폴백)
 */
@Primary
@Component
@RequiredArgsConstructor
@ConditionalOnExpression("'${spring.mail.username:}' != ''")
public class SmtpMailSender implements MailSender {

    private static final Logger log = LoggerFactory.getLogger(SmtpMailSender.class);

    private final JavaMailSender mailSender;

    @Value("${app.mail.from:}")
    private String from;

    @Override
    public void sendPasswordResetMail(String toEmail, String resetUrl) {
        SimpleMailMessage message = new SimpleMailMessage();
        if (from != null && !from.isBlank()) {
            message.setFrom(from);
        }
        message.setTo(toEmail);
        message.setSubject("[WMS] 비밀번호 재설정 안내");
        message.setText(
                "안녕하세요.\n\n"
                + "아래 링크에서 15분 이내에 비밀번호를 재설정해 주세요.\n"
                + resetUrl + "\n\n"
                + "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.");
        mailSender.send(message);
        log.info("[메일] 비밀번호 재설정 메일 발송 완료 → {}", toEmail);
    }
}
