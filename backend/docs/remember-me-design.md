# 자동로그인(Remember Me) 아키텍처 설계 및 참고 구현

> 기술 스택 중립적으로 기술합니다. 서버 코드는 프레임워크에 종속되지 않는 의사코드/TypeScript 스타일,
> 클라이언트 코드는 브라우저 표준(fetch) 기준입니다. 파라미터·엔드포인트명은 범용 명칭으로 추상화했습니다.

---

## 0. 설계 원칙 요약

핵심은 **"짧은 접근 토큰 + 긴 갱신 토큰"의 2-토큰 분리**와, 갱신 토큰의 **회전(Rotation) + 재사용 탐지**입니다.

| 항목 | 접근 토큰 (Access Token) | 갱신 토큰 (Refresh Token) |
|---|---|---|
| 형태 | 서명된 JWT(자가 검증) | 불투명(opaque) 랜덤 문자열 |
| 수명 | 짧음 (10~15분) | 김 (자동로그인 ON: 14~30일) |
| 저장(클라이언트) | **메모리(JS 변수)만** | **HttpOnly + Secure 쿠키** |
| 저장(서버) | 저장 안 함(무상태) | **해시로 DB 저장(세션 원장)** |
| 전송 | `Authorization: Bearer` 헤더 | 쿠키 자동 전송 (갱신 엔드포인트 한정) |
| 노출 위험 | XSS 시에도 수명이 짧아 피해 제한 | JS가 읽을 수 없음(HttpOnly) |

이 구조가 성립하는 이유:
- 접근 토큰을 **localStorage에 두지 않고 메모리에만** 두면, XSS가 발생해도 지속적으로 재사용 가능한 장기 토큰이 유출되지 않습니다.
- 갱신 토큰을 **HttpOnly 쿠키**에 두면 JS가 값 자체를 읽을 수 없어 XSS 탈취가 차단됩니다.
- 쿠키는 자동 전송되어 CSRF에 노출되므로, 갱신·로그아웃 엔드포인트에만 **SameSite + CSRF 토큰(이중 방어)** 을 겁니다.

---

## 1. 인증 메커니즘 및 토큰 관리

### 1.1 토큰 발급 정책

- **로그인 성공 시**
  1. 접근 토큰(JWT) 발급 — 클레임: `sub`(userId), `roles`, `exp`(10~15분).
  2. `rememberMe === true` 인 경우에만 갱신 토큰 발급.
     - `rememberMe === false`: 갱신 토큰을 발급하지 않거나, **세션 쿠키**(Max-Age 미지정, 브라우저 종료 시 소멸)로 짧게 발급.
- 갱신 토큰은 **암호학적 난수**(예: 32~64바이트)로 생성하고, 원문은 클라이언트 쿠키로만 내려주며 **서버 DB에는 해시(SHA-256)로만** 저장합니다. (DB 유출 시에도 원문 토큰 복원 불가)

### 1.2 클라이언트 저장 위치와 쿠키 옵션 (권장안)

| 대상 | 위치 | 옵션 |
|---|---|---|
| 접근 토큰 | **메모리**(앱 상태) | 영속화 금지. 새로고침 시 2장의 무음 복구로 재획득 |
| 갱신 토큰 | **HttpOnly 쿠키** | `HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=<refreshTtl>` |
| CSRF 토큰 | 일반 쿠키 or 응답 바디 | `Secure; SameSite=Strict` (HttpOnly 아님 — JS가 읽어 헤더로 재전송) |

- `HttpOnly`: JS 접근 차단(XSS 방어의 핵심).
- `Secure`: HTTPS 채널에서만 전송.
- `SameSite=Strict`: 타 사이트발 요청에 쿠키 미첨부 → CSRF 1차 차단. (외부 리다이렉트 로그인 시나리오가 있으면 `Lax`).
- `Path=/auth`: 갱신 토큰 쿠키를 **인증 엔드포인트 경로로만** 스코프 → 일반 API 호출엔 아예 실려가지 않음(공격면 축소).
- `Max-Age`: 자동로그인 ON이면 지정(영속 쿠키), OFF면 생략(세션 쿠키).

### 1.3 서버 DB 토큰 관리 (세션 원장)

```
TABLE refresh_tokens
  id           PK
  user_id      FK           -- 소유자
  family_id    UUID         -- 토큰 계보(회전 체인) 식별자 = "세션"
  token_hash   CHAR(64)     -- SHA-256(raw refresh token)
  device_info  TEXT NULL    -- UA/디바이스 라벨(감사용)
  ip_issued    TEXT NULL
  issued_at    TIMESTAMP
  expires_at   TIMESTAMP
  rotated_at   TIMESTAMP NULL   -- 회전(사용)된 시각. NULL이면 아직 유효
  revoked      BOOLEAN DEFAULT false
  INDEX(token_hash), INDEX(user_id), INDEX(family_id)
```

- **다중 기기 허용(권장 기본값)**: 기기마다 별도 `family_id` 로우를 유지 → 여러 기기 동시 자동로그인.
- **단일 기기 정책(옵션)**: 로그인 시 해당 `user_id`의 기존 유효 로우를 모두 `revoked=true` 처리 → "1기기 1토큰".
- `family_id`는 **한 세션의 회전 계보**를 묶습니다. 회전마다 새 로우가 생기고 이전 로우는 `rotated_at`이 채워집니다. 재사용 탐지(2.2)의 기준이 됩니다.

---

## 2. 자동인증 및 토큰 갱신 프로세스

### 2.1 무음 세션 복구 (재방문 흐름)

```
[앱 부팅]
   |  (메모리에 접근 토큰 없음)
   v
POST /auth/refresh          <- 브라우저가 HttpOnly 갱신 쿠키를 자동 첨부
   |
   +- 200: { accessToken } -> 메모리에 저장 -> 로그인 상태로 진입
   +- 401                   -> 비로그인 상태 확정 -> 로그인 페이지(또는 게스트 화면)
```

- 클라이언트는 부팅 시 **무조건 한 번** `/auth/refresh`를 시도하고, 실패하면 조용히 로그아웃 상태로 둡니다(에러 팝업 없음).

### 2.2 회전(Rotation) + 재사용 탐지 갱신 로직

갱신 1회 = **기존 갱신 토큰 폐기 + 새 갱신 토큰 발급**. 이미 폐기(회전)된 토큰이 다시 들어오면 **탈취로 간주**하고 해당 세션 계보 전체를 폐기합니다.

```
FUNCTION rotateRefresh(rawTokenFromCookie, csrfHeader, csrfCookie):
    assertCsrf(csrfHeader, csrfCookie)                 # 3.2
    hash = sha256(rawTokenFromCookie)
    row  = db.findByTokenHash(hash)

    IF row IS NULL:                                    # DB에 없음 = 위조/이미 삭제
        clearAuthCookies()
        THROW AuthError(401, "INVALID_REFRESH")

    IF row.revoked OR now() > row.expires_at:          # 폐기됨/만료됨
        clearAuthCookies()
        THROW AuthError(401, "REFRESH_EXPIRED_OR_REVOKED")

    IF row.rotated_at IS NOT NULL:                     # * 재사용 탐지: 이미 회전된 토큰
        db.revokeFamily(row.family_id)                 # 계보 전체 폐기(탈취 대응)
        clearAuthCookies()
        THROW AuthError(401, "REFRESH_REUSE_DETECTED")

    # --- 정상 회전 ---
    db.markRotated(row.id)                             # rotated_at = now()
    newRaw   = secureRandom()
    db.insert({
        user_id: row.user_id, family_id: row.family_id,   # 같은 계보 유지
        token_hash: sha256(newRaw),
        issued_at: now(), expires_at: now() + REFRESH_TTL
    })
    setRefreshCookie(newRaw, maxAge = REFRESH_TTL)     # 회전된 새 토큰을 쿠키에 재설정
    rotateCsrfToken()                                  # CSRF 토큰도 함께 회전(권장)
    RETURN issueAccessToken(row.user_id)               # 새 접근 토큰(JWT)
```

- **원자성**: `markRotated` + `insert`는 한 트랜잭션으로 처리하고, `token_hash`에 UNIQUE + 비관적 락(또는 `rotated_at IS NULL` 조건부 UPDATE)으로 **동시 갱신 경합**을 막습니다. (한 순간에 두 요청이 같은 토큰을 회전시키지 못하도록)
- 회전 실패/재사용 탐지 시 `family` 단위 폐기가 정답입니다. 단일 로우만 지우면 공격자·정상 사용자 중 누가 진짜인지 구분 못 하므로, **계보를 통째로 끊고 재로그인**을 강제합니다.

---

## 3. 보안 강화

### 3.1 XSS 대비

- 접근 토큰을 **localStorage/sessionStorage에 저장하지 않음** — 메모리에만. (XSS가 훔쳐도 10~15분짜리 + 새로고침 시 사라짐)
- 갱신 토큰은 **HttpOnly**라 `document.cookie`로 읽히지 않음.
- 추가 방어: 엄격한 **CSP** 헤더, 서버측 출력 이스케이프, 의존성 취약점 점검.
- 원칙: "장기 자격증명은 절대 JS가 읽을 수 있는 곳에 두지 않는다."

### 3.2 CSRF 대비

갱신·로그아웃 엔드포인트는 쿠키로 인증되므로 CSRF 대상이 됩니다. **다층 방어**:
1. **SameSite=Strict** 쿠키 — 타 사이트발 요청엔 쿠키 미첨부.
2. **이중 제출(Double-Submit) CSRF 토큰** — 서버가 내려준 CSRF 값을 클라이언트가 **커스텀 헤더**(`X-CSRF-Token`)로 재전송, 서버는 쿠키값과 헤더값 일치를 검증. (크로스 사이트 요청은 커스텀 헤더를 못 붙이므로 차단)
3. 일반 API는 **접근 토큰을 Authorization 헤더**로 보냄 → 쿠키 기반이 아니므로 애초에 CSRF 비대상.

```
FUNCTION assertCsrf(headerToken, cookieToken):
    IF headerToken IS EMPTY OR headerToken != cookieToken:
        THROW AuthError(403, "CSRF_FAILED")
```

### 3.3 명시적 로그아웃 (양측 완전 폐기)

```
# 서버
POST /auth/logout:
    assertCsrf(...)
    hash = sha256(cookie.refreshToken)
    row  = db.findByTokenHash(hash)
    IF row: db.revokeFamily(row.family_id)   # 이 세션 계보 폐기(전체 로그아웃이면 user 전체)
    clearAuthCookies()                        # Set-Cookie ...; Max-Age=0  (쿠키 삭제)
    RETURN 204

# 클라이언트
async function logout():
    try { await api.post('/auth/logout') } finally {
        AuthStore.accessToken = null          # 메모리 접근 토큰 폐기
        redirectTo('/login')
    }
```

- 서버는 DB 로우를 폐기하고 쿠키를 `Max-Age=0`으로 소멸시켜 **재사용 불가**로 만듭니다.
- 클라이언트는 메모리 토큰을 지웁니다. (finally로 감싸 네트워크 실패에도 로컬 세션은 반드시 종료)

---

## 4. 예외 및 에러 처리

### 4.1 상황별 처리 매트릭스

| 상황 | 판정 위치 | 응답 | 서버 동작 | 클라이언트 동작 |
|---|---|---|---|---|
| 접근 토큰 만료 | API 미들웨어 | 401 `ACCESS_EXPIRED` | 없음 | 무음 `/auth/refresh` 후 원요청 1회 재시도 |
| 접근 토큰 변조(서명 불일치/포맷 오류) | API 미들웨어 | 401 `ACCESS_INVALID` | 없음 | 즉시 로그아웃 처리 |
| 갱신 토큰 DB에 없음 | /auth/refresh | 401 `INVALID_REFRESH` | 쿠키 삭제 | 로그인 페이지 |
| 갱신 토큰 만료/폐기됨 | /auth/refresh | 401 `REFRESH_EXPIRED_OR_REVOKED` | 쿠키 삭제 | 로그인 페이지 |
| **이미 회전된 갱신 토큰 재사용** | /auth/refresh | 401 `REFRESH_REUSE_DETECTED` | **계보 전체 폐기** | 로그인 페이지(+"보안상 재로그인 필요" 안내) |
| CSRF 불일치 | /auth/refresh·logout | 403 `CSRF_FAILED` | 없음 | 로그인 페이지 |

원칙: **접근 토큰 만료만 "무음 복구"**로 처리하고, 갱신 토큰 관련 실패는 모두 **명확한 재로그인**으로 유도합니다.

### 4.2 UX를 해치지 않는 실패 처리 가이드

- **부팅 시 복구 실패**: 에러 알림 없이 조용히 비로그인 화면. (자동로그인은 "실패해도 원래대로")
- **세션 중 만료**: 사용자 조작 도중 401이 나면 **백그라운드로 refresh → 원래 요청 자동 재시도**. 사용자는 아무 것도 눈치채지 못함.
- **refresh까지 실패**: 진행 중이던 폼 입력이 있으면 로컬 임시 저장 후, "세션이 만료되어 다시 로그인해 주세요" 안내와 함께 **원래 가려던 경로를 쿼리로 보존**하여 로그인 후 복귀(`/login?redirect=<원경로>`).
- **다중 요청 동시 만료**: refresh를 **단일 비행(single-flight)** 으로 묶어 한 번만 실행하고, 대기 중이던 요청들은 그 결과를 공유해 재시도.

---

## 5. 참고 구현 코드

### 5.1 서버 — 토큰 서비스

```ts
// 프레임워크 중립. DB·해시·JWT 라이브러리는 주입.
const ACCESS_TTL  = 15 * 60;              // 15분(초)
const REFRESH_TTL = 30 * 24 * 60 * 60;    // 30일(초) — 자동로그인 ON

class TokenService {
  constructor(private db: RefreshTokenRepo, private jwt: Jwt, private crypto: Crypto) {}

  issueAccessToken(userId: string, roles: string[]): string {
    return this.jwt.sign({ sub: userId, roles }, { expiresInSec: ACCESS_TTL });
  }

  // 로그인 시: 새 계보 시작
  async issueRefreshToken(userId: string, ctx: ReqCtx): Promise<string> {
    const raw = this.crypto.randomToken(48);            // 원문(클라이언트 전용)
    await this.db.insert({
      userId,
      familyId: this.crypto.uuid(),
      tokenHash: this.crypto.sha256(raw),
      deviceInfo: ctx.userAgent, ipIssued: ctx.ip,
      issuedAt: now(), expiresAt: now() + REFRESH_TTL, revoked: false,
    });
    return raw;
  }

  // 회전 + 재사용 탐지 (핵심 로직, 2.2)
  async rotate(rawToken: string): Promise<{ accessToken: string; newRefresh: string }> {
    const hash = this.crypto.sha256(rawToken);
    const row  = await this.db.findByHash(hash);
    if (!row)                       throw new AuthError(401, "INVALID_REFRESH");
    if (row.revoked || now() > row.expiresAt)
                                    throw new AuthError(401, "REFRESH_EXPIRED_OR_REVOKED");
    if (row.rotatedAt != null) {    // 이미 사용된 토큰이 다시 옴 = 탈취 신호
      await this.db.revokeFamily(row.familyId);
      throw new AuthError(401, "REFRESH_REUSE_DETECTED");
    }
    // 원자적 회전: rotated_at IS NULL 조건부 업데이트로 경합 차단
    const ok = await this.db.markRotatedIfUnused(row.id);
    if (!ok) throw new AuthError(401, "REFRESH_REUSE_DETECTED");

    const newRaw = this.crypto.randomToken(48);
    await this.db.insert({
      userId: row.userId, familyId: row.familyId,       // 같은 계보 유지
      tokenHash: this.crypto.sha256(newRaw),
      issuedAt: now(), expiresAt: now() + REFRESH_TTL, revoked: false,
    });
    const user = await this.db.loadUser(row.userId);
    return { accessToken: this.issueAccessToken(user.id, user.roles), newRefresh: newRaw };
  }
}
```

### 5.2 서버 — 인증 엔드포인트

```ts
const REFRESH_COOKIE = "rt";
const CSRF_COOKIE    = "csrf";

function setRefreshCookie(res, raw, rememberMe: boolean) {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/auth",
    ...(rememberMe ? { maxAge: REFRESH_TTL * 1000 } : {}),   // OFF면 세션 쿠키
  });
}
function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE, token, { secure: true, sameSite: "strict", path: "/" });
}
function clearAuthCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { path: "/auth" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}
function assertCsrf(req) {
  const h = req.header("X-CSRF-Token"), c = req.cookie(CSRF_COOKIE);
  if (!h || h !== c) throw new AuthError(403, "CSRF_FAILED");
}

// 로그인
POST("/auth/login", async (req, res) => {
  const { username, password, rememberMe } = req.body;
  const user = await auth.verifyCredentials(username, password);   // 실패 시 401
  const csrf = crypto.randomToken(24);
  setCsrfCookie(res, csrf);
  if (rememberMe) setRefreshCookie(res, await tokens.issueRefreshToken(user.id, ctx(req)), true);
  res.json({ accessToken: tokens.issueAccessToken(user.id, user.roles), csrfToken: csrf });
});

// 무음 복구 + 회전 갱신
POST("/auth/refresh", async (req, res) => {
  assertCsrf(req);
  const raw = req.cookie(REFRESH_COOKIE);
  if (!raw) { clearAuthCookies(res); throw new AuthError(401, "NO_REFRESH"); }
  try {
    const { accessToken, newRefresh } = await tokens.rotate(raw);
    setRefreshCookie(res, newRefresh, true);
    res.json({ accessToken });
  } catch (e) { clearAuthCookies(res); throw e; }   // 어떤 실패든 쿠키 정리 후 401/403
});

// 로그아웃
POST("/auth/logout", async (req, res) => {
  assertCsrf(req);
  const raw = req.cookie(REFRESH_COOKIE);
  if (raw) { const row = await db.findByHash(crypto.sha256(raw)); if (row) await db.revokeFamily(row.familyId); }
  clearAuthCookies(res);
  res.status(204).end();
});
```

### 5.3 서버 — 접근 토큰 검증 미들웨어

```ts
function requireAuth(req, res, next) {
  const bearer = req.header("Authorization")?.replace(/^Bearer /, "");
  if (!bearer) throw new AuthError(401, "NO_ACCESS");
  try {
    req.user = jwt.verify(bearer);            // 서명·만료 검증
    next();
  } catch (e) {
    // 만료와 변조를 구분해 클라이언트가 다르게 반응하도록
    throw new AuthError(401, e.isExpired ? "ACCESS_EXPIRED" : "ACCESS_INVALID");
  }
}
```

### 5.4 클라이언트 — 인메모리 스토어 + 단일 비행 갱신 + 자동 재시도

```ts
// 접근 토큰은 메모리에만. 새로고침되면 사라지고 5.5 부팅 복구로 재획득.
const AuthStore = {
  accessToken: null as string | null,
  csrfToken: null as string | null,
};

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // 동시 401들이 refresh를 중복 호출하지 않도록 단일 비행으로 공유
  if (!refreshInFlight) {
    refreshInFlight = fetch("/auth/refresh", {
      method: "POST",
      credentials: "include",                         // 쿠키 동봉
      headers: { "X-CSRF-Token": AuthStore.csrfToken ?? "" },
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const { accessToken } = await r.json();
        AuthStore.accessToken = accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// 모든 API 호출 래퍼: 401(만료) 시 자동 refresh -> 원요청 1회 재시도
async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = (): RequestInit => ({
    ...init,
    credentials: "include",
    headers: {
      ...(init.headers || {}),
      ...(AuthStore.accessToken ? { Authorization: `Bearer ${AuthStore.accessToken}` } : {}),
      ...(AuthStore.csrfToken ? { "X-CSRF-Token": AuthStore.csrfToken } : {}),
    },
  });

  let res = await fetch(input, withAuth());
  if (res.status === 401) {
    const code = res.headers.get("X-Error-Code");     // 서버가 내려주는 사유(선택)
    if (code === "ACCESS_INVALID") { forceLogout(); return res; }  // 변조: 즉시 종료
    const ok = await refreshSession();                // 만료: 복구 시도
    if (ok) res = await fetch(input, withAuth());      // 원요청 재시도
    else forceLogout();                                // 복구 실패: 로그인으로
  }
  return res;
}

function forceLogout() {
  AuthStore.accessToken = null;
  const back = encodeURIComponent(location.pathname + location.search);
  location.assign(`/login?redirect=${back}`);          // 원경로 보존 후 이동
}
```

### 5.5 클라이언트 — 부팅 시 무음 세션 복구

```ts
// 앱 진입점에서 1회. 실패해도 조용히 비로그인 상태.
async function bootstrapAuth(): Promise<"authed" | "guest"> {
  const ok = await refreshSession();     // 쿠키가 있으면 세션 복구, 없으면 false
  return ok ? "authed" : "guest";
}
```

---

## 6. 배포 시 체크리스트

- [ ] 전 구간 HTTPS 강제(`Secure` 쿠키 전제).
- [ ] 접근 토큰은 어떤 영속 저장소에도 저장하지 않음(메모리 전용).
- [ ] 갱신 토큰은 DB에 **해시로만** 저장(원문 비저장).
- [ ] 회전 시 `rotated_at IS NULL` 조건부 업데이트로 동시성 경합 차단.
- [ ] 재사용 탐지 시 **family 단위 폐기**.
- [ ] `/auth/*` 에 CSRF 이중 방어(SameSite + 헤더 검증).
- [ ] CSP·의존성 취약점 점검으로 XSS 표면 최소화.
- [ ] 로그아웃은 서버 폐기 + 쿠키 삭제 + 클라이언트 메모리 초기화 3종 동시.
- [ ] (선택) 만료 세션 원장 주기적 청소 배치, 로그인 알림/디바이스 목록 관리.

---

## 부록: 현재 WMS 프로젝트에 적용할 때의 매핑(참고)

현재 스택(Spring Security + JWT + React)에 이식하려면:
- 접근 토큰 = 기존 JWT를 그대로 사용하되 **수명을 12시간 → 15분으로 단축**, 프론트는 localStorage 대신 메모리 보관으로 전환.
- 갱신 토큰 = `refresh_tokens` 엔티티 + Repository 신설, `JwtAuthenticationFilter`와 분리된 `/api/auth/refresh` 컨트롤러.
- 쿠키 세팅 = `ResponseCookie` (HttpOnly/Secure/SameSite=Strict/Path=/api/auth).
- CSRF = `/api/auth/**`에 한해 이중 제출 토큰 검증 필터 추가.
- 프론트 = 기존 axios 인스턴스의 인터셉터에 401→refresh→재시도(single-flight)를 붙이고, `authStorage`를 메모리 기반으로 리팩터링.
