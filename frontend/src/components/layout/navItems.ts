import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  Users,
  Warehouse,
  Grid3x3,
  CreditCard,
  Building2,
  UserCog,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  description: string
  icon: LucideIcon
  adminOnly?: boolean
}

// 사이드바 + 헤더(현재 페이지 제목)에서 공통 사용
export const navItems: NavItem[] = [
  { to: '/dashboard', label: '대시보드', description: '종합 현황 및 주요 지표', icon: LayoutDashboard },
  { to: '/calendar', label: '입출고 캘린더', description: '입고·출고·청구 일정 대시보드', icon