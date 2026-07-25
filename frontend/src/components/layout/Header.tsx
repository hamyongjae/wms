import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  ChevronDown,
  Bell,
  LogOut,
  Loader2,
  Palette,
  Check,
} from 'lucide-react'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { loadNotifications, type AppNotification } from '@/lib/notifications'
import { useCompanyName } from '@/hooks/useCompanyName'
import { THEMES, getTheme, applyTheme, type ThemeId } from '@/lib/theme'

interface HeaderProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Header({ collapsed, onToggle }: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/70 px-4 backdrop-blur">
      {/* 사이드바 토글은 md 이상에서만 — 모바일은 하단 탭 바가 내비게이션을 맡는다 */}
      <button
        type="button"
        onClick={onToggle}
        title="사이드바 접기/펼치기"
        className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 md:flex"
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <CompanyBadge />

      <div className="flex-1" />

      <ThemePicker />
      <NotificationBell />
      <UserMenu />
    </header>
  )
}

/* ===== 테마(포인트 컬러) 선택기 ===== */
function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState<ThemeId>(() => getTheme())

  function pick(id: ThemeId) {
    applyTheme(id)
    setCurrent(id)
    setOpen(false)
  }

  const activeColor = THEMES.find((t) => t.id === current)?.color ?? '#0d8a89'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="테마 색상 변경"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <Palette size={18} />
        <span
          className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-1 ring-white"
          style={{ backgroundColor: activeColor }}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <p className="px-2 py-1.5 text-xs font-medium text-slate-400">테마 색상</p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: t.color }}
                />
                <span className="flex-1">{t.label}</span>
                {t.id === current && <Check size={15} className="text-slate-500" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ===== 소속 업체 배지 — 동적 업체명(캐시 공유) ===== */
function CompanyBadge() {
  const name = useCompanyName()

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700">
      <Building2 size={16} className="text-slate-400" />
      <span className="max-w-[180px] truncate">{name}</span>
    </div>
  )
}

/* ===== 알림 벨 — 실데이터 연동 ===== */
const TONE_DOT: Record<AppNotification['tone'], string> = {
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-400',
}

function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<AppNotification[]>([])
  const [urgent, setUrgent] = useState(0)

  useEffect(() => {
    let alive = true
    loadNotifications()
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setUrgent(r.urgentCount)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="알림"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell size={18} />
        {urgent > 0 && (
          <span className="absolute right-2 top-2 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
        {urgent === 0 && items.length > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-400" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            <p className="px-3 py-2 text-xs font-medium text-slate-400">
              알림 {loading ? '' : `${items.length}건`}
            </p>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
                <Loader2 size={15} className="animate-spin" />
                <span className="text-xs">불러오는 중…</span>
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">새 알림이 없습니다.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      if (n.to) navigate(n.to)
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
                  >
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE_DOT[n.tone])} />
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-700">{n.text}</span>
                      {n.sub && <span className="mt-0.5 block truncate text-xs text-slate-400">{n.sub}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ===== 사용자 메뉴 ===== */
function UserMenu() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const user = authStorage.getUser()
  const initial = user?.name?.trim()?.[0] ?? '?'

  function logout() {
    authStorage.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
          {initial}
        </div>
        <span className="hidden text-sm font-medium text-slate-700 sm:block">{user?.name ?? '사용자'}</span>
        <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            <div className="px-3 py-2">
              <p className="text-sm font-medium text-slate-800">{user?.name ?? '사용자'}</p>
              <p className="text-xs text-slate-400">{user?.role === 'ADMIN' ? '관리자' : '직원'}</p>
            </div>
            <div className="my-1 h-px bg-slate-100" />
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut size={16} />
              로그아웃
            </button>
          </div>
        </>
      )}
    </div>
  )
}
