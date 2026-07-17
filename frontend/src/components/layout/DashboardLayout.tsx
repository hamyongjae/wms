import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const COLLAPSE_KEY = 'wms.sidebar.collapsed'

/**
 * 로그인 후 모든 화면을 감싸는 공통 셸.
 * - 사이드바 접기/펼치기 상태를 로컬에 보관(새로고침해도 유지)
 * - 우측 컬럼이 스크롤되고 헤더는 sticky 로 상단 고정
 */
export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  )

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  return (
    <div className="bg-yard-grid flex h-screen">
      <Sidebar collapsed={collapsed} />
      <div className="flex-1 overflow-y-auto">
        <Header collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        <main className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
