import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import YardDispatchPage from '@/pages/YardDispatchPage'
import WarehousesPage from '@/pages/WarehousesPage'
import BillingPage from '@/pages/BillingPage'
import ScheduleCalendarPage from '@/pages/ScheduleCalendarPage'
import OrdersPage from '@/pages/OrdersPage'
import CustomersPage from '@/pages/CustomersPage'
import StaffPage from '@/pages/StaffPage'
import SettingsPage from '@/pages/SettingsPage'
import ProtectedRoute from '@/components/ProtectedRoute'
import DashboardLayout from '@/components/layout/DashboardLayout'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* 로그인 필요 구간 → 공통 레이아웃(사이드바/상단바) 안에서 렌더 */}
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar" element={<ScheduleCalendarPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/warehouses" element={<WarehousesPage />} />
          <Route path="/yard" element={<YardDispatchPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* 그 외 경로는 대시보드로 (미로그인 시 가드가 로그인으로 보냄) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
