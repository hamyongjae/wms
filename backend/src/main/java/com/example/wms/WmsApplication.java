package com.example.wms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

// 우리는 JWT로 인증하므로 스프링의 기본 인메모리 계정(생성 비밀번호)은 불필요 → 제외
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class WmsApplication {

	public static void main(String[] args) {
		SpringApplication.run(WmsApplication.class, args);
	}

}
