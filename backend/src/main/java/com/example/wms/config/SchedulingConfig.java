package com.example.wms.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 스케줄링 활성화.
 * @Scheduled 이 붙은 빈(BillingScheduler)이 지정 주기에 자동 실행된다.
 */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
