package com.example.wms;

import com.example.wms.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;

/**
 * 기동 시 매핑 정합성(모든 @TenantId 이중 매핑, JPA 엔티티 관계 등)이 깨지지 않았는지 확인한다.
 * 기존에는 실제 개발 DB(localhost:5432/wms)에 의존했으나, 이 클래스가 실행될 때 그 DB가
 * 떠 있지 않으면 실패해서 검증력이 없었다 — Testcontainers로 격리된 Postgres를 띄운다.
 */
class WmsApplicationTests extends IntegrationTestBase {

	@Test
	void contextLoads() {
	}

}
