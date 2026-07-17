import axios from 'axios'
import { authStorage } from './auth'

// 백엔드와 통신하는 공용 axios 인스턴스.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080',
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
