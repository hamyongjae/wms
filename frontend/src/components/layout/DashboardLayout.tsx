import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import MobileTabBar from './MobileTabBar'

const COLLAPSE_KEY = 'wms.sidebar.collapsed'

/**
 * 로그인 후 모든 화면을 감싸는 공통 셸.
 * - 사이드바 접기/펼치기 상태를 로컬에 보관(새로고침해도 유지)
 * - 우측 컬럼이 스크롤되고 헤더는 sticky 로 상단 고정
 * - [형태 승격] 모바일(<md)에선 사이드바를 숨기고 하단 탭 바(엄지 존)가 내비게이션을 맡는다.
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
      {/* 사이드바는 md 이상에서만 — 모바일에선 하단 탭 바로 대체 */}
      <div className="hidden md:contents">
        <Sidebar collapsed={collapsed} />
      </div>
      <div className="flex-1 overflow-y-auto">
        <Header collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        {/* 모바일은 하단 탭 바 높이만큼 여백을 확보해 콘텐츠가 가려지지 않게 */}
        <main className="p-4 pb-24 sm:p-6 md:pb-8 lg:p-8">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
