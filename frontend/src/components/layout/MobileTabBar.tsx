import { useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { navItems } from './navItems'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import Modal from '@/components/ui/Modal'

/**
 * [엄지 존] 모바일 전용 하단 탭 바.
 * 주요 4개 메뉴 + '더보기'(나머지 메뉴를 바텀 시트로) — 5개 초과는 프리미엄을 무너뜨린다.
 * md 이상에서는 렌더되지 않고 좌측 사이드바가 그 역할을 이어받는다(형태 승격 규칙).
 */

// 하단 탭에 상시 노출할 주요 경로 (엄지 존의 4석)
const PRIMARY_PATHS = ['/dashboard', '/orders', '/yard', '/billing']

export default function MobileTabBar() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'
  const [moreOpen, setMoreOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const available = useMemo(() => navItems.filter((i) => !i.adminOnly || isAdmin), [isAdmin])
  const primary = useMemo(
    () => PRIMARY_PATHS.map((p) => available.find((i) => i.to === p)).filter((i) => i != null),
    [available],
  )
  const rest = useMemo(() => available.filter((i) => !PRIMARY_PATHS.includes(i.to)), [available])

  // '더보기'에 속한 화면에 있을 때 더보기 탭을 활성으로 표시
  const onRestPage = rest.some((i) => location.pathname.startsWith(i.to))

  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/92 backdrop-blur-md md:hidden">
        <div className="flex items-stretch">
          {primary.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="min-w-0 flex-1">
              {({ isActive }) => (
                <div
                  className={cn(
                    'card-press flex flex-col items-center gap-0.5 py-2 pt-2.5',
                    isActive ? 'text-indigo-600' : 'text-slate-400',
                  )}
                >
                  <Icon size={21} strokeWidth={isActive ? 2.2 : 1.6} />
                  <span className={cn('text-[10px] leading-tight', isActive ? 'font-semibold' : 'font-medium')}>
                    {label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className="min-w-0 flex-1">
            <div
              className={cn(
                'card-press flex flex-col items-center gap-0.5 py-2 pt-2.5',
                onRestPage ? 'text-indigo-600' : 'text-slate-400',
              )}
            >
              <MoreHorizontal size={21} strokeWidth={onRestPage ? 2.2 : 1.6} />
              <span className={cn('text-[10px] leading-tight', onRestPage ? 'font-semibold' : 'font-medium')}>
                더보기
              </span>
            </div>
          </button>
        </div>
      </nav>

      {/* 나머지 메뉴 — 바텀 시트(모바일에선 Modal이 시트로 렌더된다) */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="전체 메뉴">
        <div className="grid grid-cols-3 gap-2 pb-1">
          {rest.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to)
            return (
              <button
                key={to}
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  navigate(to)
                }}
                className={cn(
                  'card-press flex flex-col items-center gap-1.5 rounded-2xl px-2 py-4',
                  active ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon size={22} strokeWidth={1.8} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            )
          })}
        </div>
      </Modal>
    </>
  )
}
