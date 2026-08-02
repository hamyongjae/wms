package com.example.wms.security.tenant;

import com.example.wms.security.SecurityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.function.Supplier;

/**
 * ===== [테넌트 컨텍스트] =====
 *
 * "지금 이 스레드가 어느 업체(tenant)로서 DB를 보는가"를 결정한다.
 * Hibernate 의 {@link WmsTenantIdentifierResolver} 가 매 쿼리마다 이 값을 물어보고,
 * 모든 SELECT 에 {@code tenant_id = ?} 를 자동으로 끼워 넣는다.
 *
 * <h3>왜 필요한가</h3>
 * 기존에는 리포지토리마다 개발자가 손으로 {@code where tenantId = :tenantId} 를 붙였다.
 * 한 곳만 빠뜨려도 다른 업체의 계약·매출이 그대로 노출된다. 리뷰로는 못 막는 종류의 사고다.
 * 이제는 필터가 ORM 계층에서 자동으로 걸리므로, 깜빡하는 것이 기본적으로 안전하다.
 *
 * <h3>우선순위</h3>
 * <ol>
 *   <li>명시적 override({@link #runAs}) — 인증 정보가 없는 흐름(회원가입·스케줄러)에서 사용</li>
 *   <li>로그인 사용자의 tenantId — 일반적인 API 요청</li>
 *   <li>{@link #ROOT} — 인증 전(로그인·비밀번호 재설정) 흐름. 필터를 걸지 않는다.</li>
 * </ol>
 *
 * <h3>ROOT 의 안전장치</h3>
 * ROOT 상태에서 새 엔티티를 저장하면 Hibernate 가 tenant_id 에 {@link #ROOT}(-1)을 쓰려 하는데,
 * tenant_id 는 tenants 테이블을 향한 FK 라서 DB가 즉시 거부한다.
 * 즉 "테넌트 없이 데이터를 만드는 실수"는 조용히 새지 않고 예외로 터진다 — 의도된 설계다.
 */
public final class TenantContext {

    /**
     * 필터를 적용하지 않는 특수 식별자.
     * 로그인(아이디로 전 테넌트 조회)·회원가입처럼 아직 소속이 정해지지 않은 흐름에서 쓰인다.
     * 존재하지 않는 tenant id 라서 이 값으로는 INSERT 가 성립하지 않는다(FK 위반).
     */
    public static final Long ROOT = -1L;

    private static final ThreadLocal<Long> OVERRIDE = new ThreadLocal<>();

    private TenantContext() {
    }

    /**
     * 현재 스레드가 바라보는 테넌트.
     * Hibernate 리졸버가 호출하므로 절대 null 을 반환하지 않는다.
     */
    public static Long current() {
        Long override = OVERRIDE.get();
        if (override != null) {
            return override;
        }
        // SecurityContext 가 비어 있는 흐름(로그인 필터 이전, 스케줄러, 기동 시 마이그레이션)은 ROOT
        if (SecurityContextHolder.getContext().getAuthentication() == null) {
            return ROOT;
        }
        try {
            return SecurityUtils.getCurrentTenantId();
        } catch (IllegalStateException e) {
            // 익명 인증(anonymousUser) 등 UserPrincipal 이 아닌 경우
            return ROOT;
        }
    }

    /**
     * 지정한 테넌트로 간주하고 작업을 수행한다 (반환값 있음).
     * 회원가입 직후처럼 "방금 만든 업체 소속으로 데이터를 넣어야 하는데 아직 로그인 상태가 아닌" 흐름에 쓴다.
     * 중첩 호출을 대비해 이전 값을 복원한다.
     */
    public static <T> T runAs(Long tenantId, Supplier<T> body) {
        Long previous = OVERRIDE.get();
        OVERRIDE.set(tenantId);
        try {
            return body.get();
        } finally {
            restore(previous);
        }
    }

    /** 지정한 테넌트로 간주하고 작업을 수행한다 (반환값 없음). */
    public static void runAs(Long tenantId, Runnable body) {
        runAs(tenantId, () -> {
            body.run();
            return null;
        });
    }

    /**
     * 테넌트 필터를 끄고 작업을 수행한다.
     * 전 테넌트를 가로질러 읽어야 하는 배치(예: 야간 청구 스케줄러가 대상 테넌트를 훑는 단계)에만 쓴다.
     * 이 안에서 새 엔티티를 저장하면 FK 위반으로 실패하므로, 저장은 {@link #runAs} 로 감싸야 한다.
     */
    public static <T> T runAsRoot(Supplier<T> body) {
        return runAs(ROOT, body);
    }

    private static void restore(Long previous) {
        if (previous == null) {
            OVERRIDE.remove();
        } else {
            OVERRIDE.set(previous);
        }
    }
}
