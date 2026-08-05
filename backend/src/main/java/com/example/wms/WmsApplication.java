package com.example.wms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.TimeZone;

@SpringBootApplication
@EnableScheduling
public class WmsApplication {

	public static void main(String[] args) {
		// [타임존 고정] 서버 OS/JVM 기본 타임존이 UTC로 뜨면 LocalDate.now() 기준 "오늘"이
		// 한국 자정~오전 9시 사이에 하루 뒤처진다(예: 입고일=오늘(KST)이 서버 기준 미래로
		// 오인되어 거부됨) — @Scheduled cron도 같은 기본 타임존을 쓰므로 "오전 9시" 배치가
		// 실제로는 저녁 6시에 도는 등 어긋난다. Spring 컨텍스트 기동 전에 고정해야
		// 스케줄러가 올바른 타임존으로 트리거를 등록한다.
		TimeZone.setDefault(TimeZone.getTimeZone("Asia/Seoul"));
		SpringApplication.run(WmsApplication.class, args);
	}

}
