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

export const authStorage = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token)
  },
  getUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  },
  setUser(user: AuthUser) {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },
  // 가입 업체명 캐시 (헤더/사이드바 동적 타이틀용)
  getTenantName(): string | null {
    return localStorage.getItem(TENANT_NAME_KEY)
  },
  setTenantName(name: string) {
    localStorage.setItem(TENANT_NAME_KEY, name)
  },
  isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(TENANT_NAME_KEY)
  },
}
