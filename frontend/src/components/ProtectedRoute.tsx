import { Navigate, Outlet } from 'react-router-dom'
import { authStorage } from '@/lib/auth'

// 로그인(토큰) 없으면 로그인 화면으로 튕겨내는 라우트 가드.
export default function ProtectedRoute() {
  if (!authStorage.isAuthenticated()) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}
