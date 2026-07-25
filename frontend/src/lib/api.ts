import axios from 'axios'
import { authStorage } from './auth'

/**
 * 백엔드 API 주소 결정.
 * 우선순위:
 *  1. VITE_API_BASE_URL 환경변수 (운영 배포·터널링 시 명시)
 *  2. 현재 접속한 호스트로 자동 유추 (모바일 LAN 테스트 — 폰에서 192.168.x.x:5173으로 열면
 *     자동으로 192.168.x.x:8080 을 호출. .env 수정 불필요)
 *  3. 최종 폴백 localhost:8080
 */
function resolveBaseURL(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location.hostname) {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:8080`
  }
  return 'http://localhost:8080'
}

// 백엔드와 통신하는 공용 axios 인스턴스.
export const api = axios.create({
  baseURL: resolveBaseURL(),
  headers: { 'Content-Type': 'application/json' },
})

// [요청 인터셉터] 저장된 토큰이 있으면 Authorization 헤더에 자동 첨부
api.interceptors.request.use((config) => {
  const token = authStorage.getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// [응답 인터셉터] 401(인증 만료/없음)이면 로그아웃 처리 후 로그인 화면으로
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
