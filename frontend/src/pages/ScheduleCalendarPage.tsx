import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  CalendarDays,
  PackageOpen,
  Truck,
  Bell,
  ArrowRightLeft,
  CheckCircle2,
} from 'lucide-react'
import {
  getMonthEvents,
  type CalendarEvent,
  type CalendarEventType,
} from '@/api/calendarApi'
import { billingApi } from '@/api/billingApi'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'

type FilterMode = 'ALL' | CalendarEventType

const TYPE_META: Record<CalendarEventType, { label: string; emoji: string; badge: string; dot: string }> = {
  INBOUND: {
    label: '입고',
    emoji: '📥',
    badge: 'bg-blue-50 text-blue-700 ring-blue-100',
    dot: 'bg-blue-500',
  },
  OUTBOUND: {
    label: '출고',
    emoji: '📤',
    badge: 'bg-orange-50 text-orange-700 ring-orange-100',
    dot: 'bg-orange-500',
  },
  BILLING: {
    label: '청구',
    emoji: '💰',
    badge: 'bg-red-50 text-red-700 ring-red-100',
    dot: 'bg-red-500',
  },
}

const FILTERS: Array<{ key: FilterMode; label: string }> = [
  { key: 'ALL', label: '전체보기' },
  { key: 'INBOUND', label: '입고만' },
  { key: 'OUTBOUND', label: '출고만' },
  { key: 'BILLING', label: '청구일만' },
]

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')
const toDateStr = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`
const todayStr = () => {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate())
}
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

// 입고/출고 이벤트는 상태에 따라 "예정/지연"을 붙여 명확히 보여준다.
function eventLabel(e: CalendarEvent): string {
  if (e.type === 'INBOUND' || e.type === 'OUTBOUND') {
    if (e.status === 'PENDING') return `${e.title} 예정`
    if (e.status === 'OVERDUE') return `${e.title} 지연`
  }
  return e.title
}

interface Cell {
  dateStr: string
  day: number
  inMonth: boolean
}

function buildMatrix(year: number, month0: number): Cell[] {
  const first = new Date(year, month0, 1)
  const startOffset = first.getDay()
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month0, 1 - startOffset + i)
    cells.push({
      dateStr: toDateStr(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month0,
    })
  }
  return cells
}

export default function ScheduleCalendarPage() {
  const navigate = useNavigate()
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month0: n.getMonth() }
  })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    getMonthEvents(cursor.year, cursor.month0 + 1)
      .then(setEvents)
      .catch(() => setError('일정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [cursor, refreshKey])

  const filtered = useMemo(
    () => (filter === 'ALL' ? events : events.filter((e) => e.type === filter)),
    [events, filter],
  )

  const eventsByDate = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of filtered) {
      const key = e.startAt.slice(0, 10)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(e)
    }
    return m
  }, [filtered])

  const matrix = useMemo(() => buildMatrix(cursor.year, cursor.month0), [cursor])
  const today = todayStr()
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : []

  const monthCounts = useMemo(() => {
    const c = { INBOUND: 0, OUTBOUND: 0, BILLING: 0 }
    for (const e of events) c[e.type]++
    return c
  }, [events])

  function moveMonth(delta: number) {
    setSelectedDate(null)
    setCursor((c) => {
      const d = new Date(c.year, c.month0 + delta, 1)
      return { year: d.getFullYear(), month0: d.getMonth() }
    })
  }
  function goToday() {
    const n = new Date()
    setCursor({ year: n.getFullYear(), month0: n.getMonth() })
    setSelectedDate(todayStr())
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">입출고 · 청구 캘린더</h2>
        <p className="mt-1 text-sm text-slate-500">하루의 입고·출고·청구 흐름을 한눈에 보고 당일 액션을 처리합니다.</p>
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-500 hover:text-emerald-700">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 상단 필터/네비 바 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                filter === f.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.key !== 'ALL' && <span className={cn('h-2 w-2 rounded-full', TYPE_META[f.key].dot)} />}
              {f.label}
              {f.key !== 'ALL' && <span className="opacity-70">{monthCounts[f.key]}</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="min-w-28 text-center text-sm font-semibold text-slate-700">
            {cursor.year}년 {cursor.month0 + 1}월
          </span>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <button type="button" onClick={() => moveMonth(-1)} className="p-1.5 text-slate-500 hover:text-slate-800" title="이전 달">
              <ChevronLeft size={16} />
            </button>
            <button type="button" onClick={goToday} className="border-x border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900">
              오늘
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="p-1.5 text-slate-500 hover:text-slate-800" title="다음 달">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 본문: 달력 + 우측 패널 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* 달력 */}
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    'py-2 text-center text-xs font-semibold',
                    i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-500',
                  )}
                >
                  {w}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-32 text-slate-400">
                <Loader2 className="animate-spin" size={18} />
                <span className="text-sm">불러오는 중…</span>
              </div>
            ) : error ? (
              <div className="px-6 py-10 text-center text-sm text-red-600">{error}</div>
            ) : (
              <div className="grid grid-cols-7">
                {matrix.map((cell, i) => {
                  const dayEvents = eventsByDate.get(cell.dateStr) ?? []
                  const isToday = cell.dateStr === today
                  const isSelected = cell.dateStr === selectedDate
                  const weekday = i % 7
                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={cn(
                        'flex min-h-24 flex-col gap-1 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-slate-50',
                        !cell.inMonth && 'bg-slate-50/40',
                        isSelected && 'ring-2 ring-inset ring-indigo-400',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                          isToday
                            ? 'bg-indigo-600 text-white'
                            : !cell.inMonth
                              ? 'text-slate-300'
                              : weekday === 0
                                ? 'text-red-500'
                                : weekday === 6
                                  ? 'text-blue-500'
                                  : 'text-slate-600',
                        )}
                      >
                        {cell.day}
                      </span>

                      <div className="flex flex-col gap-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={cn(
                              'truncate rounded px-1 py-0.5 text-[11px] font-medium ring-1',
                              TYPE_META[e.type].badge,
                              e.status === 'OVERDUE' && 'ring-red-300',
                            )}
                            title={eventLabel(e)}
                          >
                            {TYPE_META[e.type].emoji} {eventLabel(e)}
                          </span>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="pl-1 text-[10px] text-slate-400">+{dayEvents.length - 3}건 더</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 우측 상세/액션 패널 (lg: 고정 컬럼 / 모바일: 하단 시트) */}
        <div className="hidden lg:col-span-1 lg:block">
          <DetailPanel
            dateStr={selectedDate}
            events={selectedEvents}
            isAdmin={isAdmin}
            onAction={(msg) => {
              setNotice(msg)
              setRefreshKey((k) => k + 1)
            }}
            navigate={navigate}
          />
        </div>
      </div>

      {/* 모바일 하단 시트 */}
      {selectedDate && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setSelectedDate(null)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
            <DetailPanel
              dateStr={selectedDate}
              events={selectedEvents}
              isAdmin={isAdmin}
              embedded
              onClose={() => setSelectedDate(null)}
              onAction={(msg) => {
                setNotice(msg)
                setRefreshKey((k) => k + 1)
              }}
              navigate={navigate}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ===== 우측 상세/액션 패널 ===== */
function DetailPanel({
  dateStr,
  events,
  isAdmin,
  embedded,
  onClose,
  onAction,
  navigate,
}: {
  dateStr: string | null
  events: CalendarEvent[]
  isAdmin: boolean
  embedded?: boolean
  onClose?: () => void
  onAction: (msg: string) => void
  navigate: (to: string) => void
}) {
  if (!dateStr) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-slate-400">
        <CalendarDays size={28} className="text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-500">날짜를 선택하세요</p>
        <p className="mt-1 text-xs">그 날의 입출고·청구 일정과 액션이 표시됩니다.</p>
      </div>
    )
  }

  const [y, m, d] = dateStr.split('-').map(Number)
  const label = `${y}년 ${m}월 ${d}일`

  return (
    <div className={cn(!embedded && 'rounded-2xl border border-slate-200 bg-white shadow-sm')}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-400">일정 {events.length}건</p>
        </div>
        {embedded && onClose && (
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">이 날 예정된 일정이 없습니다.</p>
      ) : (
        <div className="space-y-3 p-4">
          {events.map((e) => (
            <EventCard key={`${e.type}-${e.id}`} event={e} isAdmin={isAdmin} onAction={onAction} navigate={navigate} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ===== 이벤트 카드 + 퀵 액션 ===== */
function EventCard({
  event,
  isAdmin,
  onAction,
  navigate,
}: {
  event: CalendarEvent
  isAdmin: boolean
  onAction: (msg: string) => void
  navigate: (to: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const meta = TYPE_META[event.type]

  async function settlePayment() {
    if (!event.amount || event.amount <= 0) {
      onAction('이미 완납된 건입니다.')
      return
    }
    if (!window.confirm(`${event.customerName} · ${won(event.amount)} 전액 수금 완료로 처리할까요?`)) return
    setBusy(true)
    try {
      await billingApi.recordPayment(event.id, {
        amount: event.amount,
        method: 'BANK_TRANSFER',
        paidOn: todayStr(),
        memo: '캘린더 당일 입금 대사',
      })
      onAction(`${event.customerName} 수금 완료 처리했습니다.`)
    } catch (err) {
      onAction(isAxiosError(err) ? (err.response?.data?.message ?? '수금 처리 실패') : '수금 처리 실패')
    } finally {
      setBusy(false)
    }
  }

  async function resendNotify() {
    setBusy(true)
    try {
      await billingApi.sendPaymentRequest(event.id)
      onAction(`${event.customerName} 청구 안내를 재발송했습니다.`)
    } catch (err) {
      onAction(isAxiosError(err) ? (err.response?.data?.message ?? '재발송 실패') : '재발송 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1', meta.badge)}>
              {meta.emoji} {meta.label}
            </span>
            {event.status === 'OVERDUE' && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">연체</span>
            )}
            {event.status === 'COMPLETED' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 size={11} /> 완료
              </span>
            )}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-slate-800">{eventLabel(event)}</p>
          {event.amount != null && (
            <p className="text-xs text-slate-500">미수 {won(event.amount)}</p>
          )}
        </div>
      </div>

      {/* 유형별 퀵 액션 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {event.type === 'OUTBOUND' && (
          <QuickBtn onClick={() => navigate('/billing')} icon={<ArrowRightLeft size={13} />}>
            중도 출고 정산
          </QuickBtn>
        )}
        {event.type === 'INBOUND' && (
          <QuickBtn onClick={() => navigate('/yard')} icon={<PackageOpen size={13} />}>
            빈 슬롯 추천·배치
          </QuickBtn>
        )}
        {event.type === 'BILLING' && event.status !== 'COMPLETED' && (
          <>
            <QuickBtn onClick={settlePayment} disabled={busy} icon={<CheckCircle2 size={13} />} tone="emerald">
              수금 완료 처리
            </QuickBtn>
            {isAdmin && (
              <QuickBtn onClick={resendNotify} disabled={busy} icon={<Bell size={13} />}>
                알림톡 재발송
              </QuickBtn>
            )}
          </>
        )}
        {event.type === 'INBOUND' && (
          <QuickBtn onClick={() => navigate('/containers')} icon={<Truck size={13} />}>
            컨테이너 관리
          </QuickBtn>
        )}
      </div>
    </div>
  )
}

function QuickBtn({
  onClick,
  icon,
  children,
  disabled,
  tone = 'slate',
}: {
  onClick: () => void
  icon: ReactNode
  children: ReactNode
  disabled?: boolean
  tone?: 'slate' | 'emerald'
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50',
        cls,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
