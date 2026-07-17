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
  isAuthenticated(): boolean {
    return !!localStorage.getItem(TOKEN_KEY)
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}
