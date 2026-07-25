// 로그인 사용자 정보 + 토큰을 브라우저(localStorage)에 보관/조회하는 유틸.

export type UserRole = 'ADMIN' | 'STAFF'

export interface AuthUser {
  userId: number
  username: string
  name: string
  role: UserRole
  tenantId: number
}

const TOKEN_KEY = 'wms.token'
const USER_KEY = 'wms.user'
const TENANT_NAME_KEY = 'wms.tenantName'

/*
 * 자동 로그인(리멤버 미) 저장 전략
 * - remember = true  → localStorage 에 저장. 브라우저를 닫았다 열어도 세션 유지(자동 로그인).
 * - remember = false → sessionStorage 에 저장. 탭/브라우저를 닫으면 소멸(다음엔 재로그인).
 * 조회는 두 저장소를 모두 확인하고, 저장 시엔 선택한 쪽에 쓰고 반대쪽은 정리한다.
 */
function readBoth(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key)
}
function writeOne(key: string, value: string, remember: boolean) {
  const store = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  store.setItem(key, value)
  other.removeItem(key)
}

export const authStorage = {
  getToken(): string | null {
    return readBoth(TOKEN_KEY)
  },
  setToken(token: string, remember = true) {
    writeOne(TOKEN_KEY, token, remember)
  },
  getUser(): AuthUser | null {
    const raw = readBoth(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  },
  setUser(user: AuthUser, remember = true) {
    writeOne(USER_KEY, JSON.stringify(user), remember)
  },
  // 가입 업체명 캐시 (헤더/사이드바 동적 타이틀용) — 토큰과 같은 저장소 정책을 따른다
  getTenantName(): string | null {
    return readBoth(TENANT_NAME_KEY)
  },
  setTenantName(name: string) {
    // 토큰이 어디에 있는지에 맞춰 동일 저장소에 캐시(없으면 세션)
    const remember = localStorage.getItem(TOKEN_KEY) != null
    writeOne(TENANT_NAME_KEY, name, remember)
  },
  isAuthenticated(): boolean {
    return !!readBoth(TOKEN_KEY)
  },
  clear() {
    for (const key of [TOKEN_KEY, USER_KEY, TENANT_NAME_KEY]) {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    }
  },
}
