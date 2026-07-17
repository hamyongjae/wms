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
  { to: '/calendar', label: '입출고 일정', description: '입고·출고·청구 일정 대시보드', icon: CalendarDays },
  { to: '/orders', label: '계약 관리', description: '보관 계약·입출고 일정', icon: FileText },
  { to: '/customers', label: '고객 관리', description: '개인·기업 고객 및 상태', icon: Users },
  { to: '/warehouses', label: '창고 관리', description: '구역 및 보관 시설 설정', icon: Warehouse },
  { to: '/yard', label: '컨테이너 관리', description: '격자 맵에서 입출고·이동 처리', icon: Grid3x3 },
  { to: '/billing', label: '청구 및 정산', description: '청구 원장·미수금·세금계산서', icon: CreditCard },
  { to: '/staff', label: '직원 관리', description: '계정 추가·권한 관리', icon: UserCog, adminOnly: true },
  { to: '/settings', label: '회사 정보', description: '업체 기본 정보 설정', icon: Building2, adminOnly: true },
]
