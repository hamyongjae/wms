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
    // h-app-screen: 100dvh(폴백 100vh) — 모바일 주소창이 보일 때도 셸이 화면을 넘지 않아 하단이 잘리지 않는다
    <div className="bg-yard-grid flex h-app-screen">
      {/* 사이드바는 md 이상에서만 — 모바일에선 하단 탭 바로 대체 */}
      <div className="hidden md:contents">
        <Sidebar collapsed={collapsed} />
      </div>
      {/* overscroll-contain: 끝까지 스크롤했을 때 바깥(body)으로 스크롤이 전파돼 화면이 밀리는 것을 막는다 */}
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
        <Header collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
        {/* pb-tabbar: 탭 바 높이 + 홈 인디케이터 세이프 에어리어만큼 여백 확보(md 이상은 자동 원복) */}
        <main className="p-4 pb-tabbar sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
    </div>
  )
}
