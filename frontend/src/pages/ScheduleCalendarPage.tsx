import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  CalendarDays,
  Bell,
  ArrowRightLeft,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  Wallet,
} from 'lucide-react'
import {
  getMonthEvents,
  type CalendarEvent,
  type CalendarEventType,
} from '@/api/calendarApi'
import { billingApi } from '@/api/billingApi'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { customerApi, type Customer } from '@/api/customerApi'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { scheduleBadgeStyle, scheduleDotStyle, SCHEDULE_CATEGORY_ORDER, SCHEDULE_META, type ScheduleCategory } from '@/lib/orderSchedule'
import { orderSync } from '@/lib/orderEvents'
import { CreateOrderModal, StatusChangeModal, OrderBillingModal } from './OrdersPage'
import EditOrderModal from '@/components/order/EditOrderModal'
import Modal from '@/components/ui/Modal'
import YearPickerModal from '@/components/ui/YearPickerModal'

type FilterMode = 'ALL' | ScheduleCategory

/* [뮤티드 상태색] 원색(파랑·주황·빨강) 대신 채도를 눌러 익힌 톤 (마스터플랜 2.1) */
const TYPE_META: Record<CalendarEventType, { label: string; emoji: string; badge: string; dot: string }> = {
  INBOUND: {
    label: '입고',
    emoji: '📥',
    badge: 'bg-[#E9EEF3] text-[#5A748F] ring-[#D4DDE7]',
    dot: 'bg-[#5A748F]',
  },
  OUTBOUND: {
    label: '출고',
    emoji: '📤',
    badge: 'bg-[#F2E8E3] text-[#A65B44] ring-[#E4D2C9]',
    dot: 'bg-[#A65B44]',
  },
  BILLING: {
    label: '청구',
    emoji: '💰',
    badge: 'bg-[#EFEBE4] text-[#8A8172] ring-[#E2DCD1]',
    dot: 'bg-[#8A8172]',
  },
}

/** (type,status) → 5분류 색상 키. OVERDUE는 별도 색 없이 출고예정에 합류(연체 텍스트 배지는 별도 유지). */
function eventColorKey(e: CalendarEvent): ScheduleCategory {
  if (e.type === 'INBOUND') {
    if (e.status === 'INDEFINITE') return 'IN_INDEFINITE'
    return e.status === 'COMPLETED' ? 'IN_DONE' : 'IN_PENDING'
  }
  return e.status === 'COMPLETED' ? 'OUT_DONE' : 'OUT_PENDING'
}

/** 상단 필터 — 입고/출고 2분류 대신 5분류(입고예정/입고/출고일미정/출고예정/출고)로 세분화 */
const FILTERS: Array<{ key: FilterMode; label: string }> = [
  { key: 'ALL', label: '전체보기' },
  ...SCHEDULE_CATEGORY_ORDER.map((cat) => ({ key: cat as FilterMode, label: SCHEDULE_META[cat].label })),
]

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')
const toDateStr = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`
const todayStr = () => {
  const n = new Date()
  return toDateStr(n.getFullYear(), n.getMonth(), n.getDate())
}
const dateLabel = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
// 'YYYY-MM-DD' → 'YYYY. MM. DD' (백엔드 LocalDate 직렬화 문자열을 안전하게 표기)
const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-')
  return d ? `${y}. ${m}. ${d}` : s
}

// [정책] 예정/지연 구분 없이 입고/출고 라벨만 표시한다.
function eventLabel(e: CalendarEvent): string {
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

  // 이 화면 자체의 레이아웃 분기점(lg=1024px, 데스크톱 사이드패널 ↔ 하단 시트)과 동일한 기준.
  // Modal은 body로 포탈되므로 CSS(lg:hidden)로는 표시 여부를 못 걸러 JS로 직접 판단해야 한다.
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const onChange = (e: MediaQueryListEvent) => setIsNarrow(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

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

  // [계약 등록/수정/출고/정산] 계약관리에서 쓰는 팝업을 그대로 재사용한다.
  const [customers, setCustomers] = useState<Customer[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [createDate, setCreateDate] = useState<string | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<StorageOrder | null>(null) // 출고(정상/중도 선택)
  const [billingTarget, setBillingTarget] = useState<StorageOrder | null>(null) // 정산
  const [editTarget, setEditTarget] = useState<StorageOrder | null>(null) // 수정
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null)

  useEffect(() => {
    customerApi.list().then(setCustomers).catch(() => setCustomers([]))
    warehouseApi.list().then(setWarehouses).catch(() => setWarehouses([]))
  }, [])

  function openCreateFor(dateStr: string) {
    setCreateDate(dateStr)
    setCreateOpen(true)
  }

  // [상세 조회 후 출고/정산/수정 팝업] 캘린더 이벤트는 요약 정보뿐이라, 계약관리와 동일한 폼을
  //   그대로 쓰려면 그 계약의 전체 정보를 한 번 불러와야 한다.
  async function openOrderAction(orderId: number, action: 'outbound' | 'billing' | 'edit') {
    setActionLoadingId(orderId)
    try {
      const order = await orderApi.get(orderId)
      if (action === 'outbound') setStatusTarget(order)
      else if (action === 'billing') setBillingTarget(order)
      else setEditTarget(order)
    } catch (err) {
      setNotice(isAxiosError(err) ? (err.response?.data?.message ?? '계약 정보를 불러오지 못했습니다.') : '계약 정보를 불러오지 못했습니다.')
    } finally {
      setActionLoadingId(null)
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    if (!window.confirm(`'${event.customerName}' 계약을 삭제할까요?\n(연결된 정산서·입금 내역도 함께 삭제됩니다)`)) return
    try {
      await orderApi.remove(event.id)
      setNotice(`'${event.customerName}' 계약을 삭제했습니다.`)
      setRefreshKey((k) => k + 1)
      orderSync.emit() // 계약관리·대시보드 등 다른 화면도 함께 갱신
    } catch (err) {
      setNotice(isAxiosError(err) ? (err.response?.data?.message ?? '계약 삭제에 실패했습니다.') : '계약 삭제에 실패했습니다.')
    }
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    getMonthEvents(cursor.year, cursor.month0 + 1)
      // [정책] 입출고 일정은 입고/출고만 — 청구(BILLING) 이벤트는 표시하지 않는다.
      .then((list) => setEvents(list.filter((e) => e.type === 'INBOUND' || e.type === 'OUTBOUND')))
      .catch(() => setError('일정을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [cursor, refreshKey])

  // [실시간 동기화] 계약관리에서 입고/출고 전환·삭제가 일어나면 일정을 다시 불러온다.
  useEffect(() => orderSync.subscribe(() => setRefreshKey((k) => k + 1)), [])

  const filtered = useMemo(
    () => (filter === 'ALL' ? events : events.filter((e) => eventColorKey(e) === filter)),
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
    const c: Record<ScheduleCategory, number> = {
      IN_PENDING: 0,
      IN_DONE: 0,
      IN_INDEFINITE: 0,
      OUT_PENDING: 0,
      OUT_DONE: 0,
    }
    for (const e of events) c[eventColorKey(e)]++
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

  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  function selectYear(y: number) {
    setSelectedDate(null)
    setCursor((c) => ({ year: y, month0: c.month0 }))
    setYearPickerOpen(false)
  }

  // [스와이프로 달력 넘기기] 세로 스크롤과 헷갈리지 않도록, 가로 이동이 세로 이동보다
  // 뚜렷하고(가로>세로*1.5) 일정 거리(48px) 이상일 때만 달을 넘긴다. 손을 뗄 때 한 번만 판정.
  const SWIPE_THRESHOLD = 48
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  function onCalendarTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
  }
  function onCalendarTouchEnd(e: TouchEvent) {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return
    moveMonth(dx < 0 ? 1 : -1) // 왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달
  }

  return (
    <div className="mx-auto max-w-7xl space-y-3 md:space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">입출고 일정</h2>
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
              {f.key !== 'ALL' && <span className="h-2 w-2 rounded-full" style={scheduleDotStyle(f.key)} />}
              {f.label}
              {f.key !== 'ALL' && <span className="opacity-70">{monthCounts[f.key]}</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => setYearPickerOpen(true)}
            className="rounded-lg px-1.5 text-base font-bold text-slate-800 transition hover:bg-slate-100 sm:min-w-28 sm:text-center sm:text-sm sm:font-semibold sm:text-slate-700"
            title="연도 빠른 선택"
          >
            {cursor.year}년 {cursor.month0 + 1}월
          </button>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white sm:rounded-lg">
            <button type="button" onClick={() => moveMonth(-1)} className="p-2.5 text-slate-500 hover:text-slate-800 sm:p-1.5" title="이전 달">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={goToday} className="border-x border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 sm:px-2.5 sm:py-1 sm:text-xs sm:font-medium">
              오늘
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="p-2.5 text-slate-500 hover:text-slate-800 sm:p-1.5" title="다음 달">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 본문: 달력 + 우측 패널 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-4">
        {/* 달력 */}
        <div className="lg:col-span-3">
          <div
            className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60 touch-pan-y"
            onTouchStart={onCalendarTouchStart}
            onTouchEnd={onCalendarTouchEnd}
          >
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
                        'flex min-h-16 flex-col items-start gap-1 border-b border-r border-slate-100 p-1 text-left transition hover:bg-slate-50 lg:min-h-24 lg:p-1.5',
                        !cell.inMonth && 'bg-slate-50/40',
                        isSelected && 'ring-2 ring-inset ring-indigo-400',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold lg:h-6 lg:w-6 lg:text-xs lg:font-medium',
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

                      {/* 모바일: 화주명 칩 (작게 · 최대 2개) */}
                      <div className="flex w-full flex-col gap-0.5 lg:hidden">
                        {dayEvents.slice(0, 2).map((e) => (
                          <span
                            key={e.id}
                            className="w-full truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight"
                            style={scheduleBadgeStyle(eventColorKey(e))}
                          >
                            {e.customerName ?? eventLabel(e)}
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="pl-0.5 text-[9px] font-medium text-slate-400">+{dayEvents.length - 2}</span>
                        )}
                      </div>

                      {/* 데스크톱: 화주명 배지 */}
                      <div className="hidden w-full flex-col gap-0.5 lg:flex">
                        {dayEvents.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className="truncate rounded px-1 py-0.5 text-[11px] font-medium"
                            style={scheduleBadgeStyle(eventColorKey(e))}
                            title={e.customerName ?? eventLabel(e)}
                          >
                            {e.customerName ?? eventLabel(e)}
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
            onCreate={openCreateFor}
            onOutbound={(id) => openOrderAction(id, 'outbound')}
            onBilling={(id) => openOrderAction(id, 'billing')}
            onEdit={(id) => openOrderAction(id, 'edit')}
            onDelete={deleteEvent}
            actionLoadingId={actionLoadingId}
          />
        </div>
      </div>

      {/* 모바일/태블릿(<lg) 상세 — 예전엔 이 페이지 안에 직접 그린 fixed 오버레이였는데,
          DashboardLayout의 스크롤 컨테이너 안에 중첩된 position:fixed라 iOS에서 하단 탭 바에
          가려지거나 잘리는 동일한 버그가 있었다(Modal에서 이미 한 번 고친 것과 같은 원인).
          공용 Modal(= document.body로 포탈)로 바꿔 근본적으로 해결한다. */}
      {isNarrow && (
        <Modal
          open={selectedDate != null}
          onClose={() => setSelectedDate(null)}
          title={selectedDate ? dateLabel(selectedDate) : ''}
          footer={
            selectedDate && (
              <button
                type="button"
                onClick={() => openCreateFor(selectedDate)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-base font-bold text-white transition active:scale-[0.99]"
              >
                <Plus size={16} /> 계약 등록
              </button>
            )
          }
        >
          <DetailPanel
            dateStr={selectedDate}
            events={selectedEvents}
            isAdmin={isAdmin}
            onAction={(msg) => {
              setNotice(msg)
              setRefreshKey((k) => k + 1)
            }}
            navigate={navigate}
            onCreate={openCreateFor}
            onOutbound={(id) => openOrderAction(id, 'outbound')}
            onBilling={(id) => openOrderAction(id, 'billing')}
            onEdit={(id) => openOrderAction(id, 'edit')}
            onDelete={deleteEvent}
            actionLoadingId={actionLoadingId}
            bare
          />
        </Modal>
      )}

      {/* [계약 등록] 선택한 날짜 칸에서 열면 그 날짜가 보관 시작일에 미리 채워진다 */}
      <CreateOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        customers={customers}
        warehouses={warehouses}
        defaultStartDate={createDate}
        onCustomerAdded={(c) =>
          setCustomers((prev) => {
            const i = prev.findIndex((x) => x.id === c.id)
            if (i >= 0) {
              const next = [...prev]
              next[i] = c
              return next
            }
            return [...prev, c]
          })
        }
        onDone={() => {
          setCreateOpen(false)
          setNotice('계약을 등록했습니다.')
          setRefreshKey((k) => k + 1)
          orderSync.emit()
        }}
      />

      {/* [출고 처리] 이벤트 카드의 '출고'에서 전체 정보를 불러온 뒤, 계약관리와 동일한 정상/중도 선택 팝업을 연다 */}
      <StatusChangeModal
        target={statusTarget}
        onClose={() => setStatusTarget(null)}
        onDone={(updated) => {
          setStatusTarget(null)
          setNotice(`${updated.customerName} 출고 처리 완료`)
          setRefreshKey((k) => k + 1)
          orderSync.emit()
        }}
      />

      {/* [정산 보기] 이벤트 카드의 '정산'에서 전체 정보를 불러온 뒤 연다 */}
      <OrderBillingModal target={billingTarget} isAdmin={isAdmin} onClose={() => setBillingTarget(null)} />

      {/* [계약 수정] 이벤트 카드의 '수정'에서 전체 정보를 불러온 뒤 연다 */}
      <EditOrderModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onDone={() => {
          setEditTarget(null)
          setNotice('계약을 수정했습니다.')
          setRefreshKey((k) => k + 1)
        }}
      />

      {/* [연도 빠른 이동] 상단 "YYYY년 MM월" 라벨 탭으로 연다 */}
      <YearPickerModal
        open={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
        year={cursor.year}
        onSelect={selectYear}
      />
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
  onCreate,
  onOutbound,
  onBilling,
  onEdit,
  onDelete,
  actionLoadingId,
  bare,
}: {
  dateStr: string | null
  events: CalendarEvent[]
  isAdmin: boolean
  embedded?: boolean
  onClose?: () => void
  onAction: (msg: string) => void
  navigate: (to: string) => void
  onCreate: (dateStr: string) => void
  onOutbound: (orderId: number) => void
  onBilling: (orderId: number) => void
  onEdit: (orderId: number) => void
  onDelete: (event: CalendarEvent) => void
  actionLoadingId: number | null
  /** Modal 안(모바일 바텀시트)에서 쓸 때 — Modal이 이미 제목·닫기 버튼을 그려주므로
   *  이 컴포넌트는 상단 바 없이 이벤트 목록만 그린다(제목 중복 방지). */
  bare?: boolean
}) {
  if (!dateStr) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-slate-400">
        <CalendarDays size={28} className="text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-500">날짜를 선택하세요</p>
        <p className="mt-1 text-xs">그 날의 입출고·청구 일정과 액션이 표시됩니다.</p>
      </div>
    )
  }

  const list =
    events.length === 0 ? (
      <p className="px-4 py-8 text-center text-sm text-slate-400">이 날 예정된 일정이 없습니다.</p>
    ) : (
      <div className={cn('space-y-2', !bare && 'p-3')}>
        {events.map((e) => (
          <EventCard
            key={`${e.type}-${e.id}`}
            event={e}
            isAdmin={isAdmin}
            onAction={onAction}
            navigate={navigate}
            onOutbound={onOutbound}
            onBilling={onBilling}
            onEdit={onEdit}
            onDelete={onDelete}
            actionLoading={actionLoadingId === e.id}
          />
        ))}
      </div>
    )

  if (bare) return list

  const label = dateLabel(dateStr)

  return (
    <div className={cn(!embedded && 'rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60')}>
      <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <p className="text-xs text-slate-400">일정 {events.length}건</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onCreate(dateStr)}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
          >
            <Plus size={13} /> 계약 등록
          </button>
          {embedded && onClose && (
            <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {list}
    </div>
  )
}

/* ===== 이벤트 카드 + 퀵 액션 ===== */
function EventCard({
  event,
  isAdmin,
  onAction,
  navigate,
  onOutbound,
  onBilling,
  onEdit,
  onDelete,
  actionLoading,
}: {
  event: CalendarEvent
  isAdmin: boolean
  onAction: (msg: string) => void
  navigate: (to: string) => void
  onOutbound: (orderId: number) => void
  onBilling: (orderId: number) => void
  onEdit: (orderId: number) => void
  onDelete: (event: CalendarEvent) => void
  actionLoading: boolean
}) {
  const [busy, setBusy] = useState(false)
  const isBilling = event.type === 'BILLING'
  // 청구(BILLING)는 상태 색상 설정 대상이 아니라 기존 고정 톤을 유지한다
  const meta = isBilling ? TYPE_META.BILLING : SCHEDULE_META[eventColorKey(event)]

  async function settlePayment() {
    if (!event.amount || event.amount <= 0) {
      onAction('이미 완납된 건입니다.')
      return
    }
    if (!window.confirm(`${event.customerName} · ${won(event.amount)} 전액 입금 완료로 처리할까요?`)) return
    setBusy(true)
    try {
      await billingApi.recordPayment(event.id, {
        amount: event.amount,
        method: 'BANK_TRANSFER',
        paidOn: todayStr(),
        memo: '캘린더 당일 입금 대사',
      })
      onAction(`${event.customerName} 입금 완료 처리했습니다.`)
    } catch (err) {
      onAction(isAxiosError(err) ? (err.response?.data?.message ?? '입금 처리 실패') : '입금 처리 실패')
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
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                isBilling && `ring-1 ${TYPE_META.BILLING.badge}`,
              )}
              style={isBilling ? undefined : scheduleBadgeStyle(eventColorKey(event))}
            >
              {meta.label}
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

          {(event.startDate || event.endDate || event.unitPrice != null || event.warehouseName) && (
            <dl className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-xs">
              {event.startDate && (
                <div className="flex items-center gap-2">
                  <dt className="w-10 shrink-0 text-slate-400">시작일</dt>
                  <dd className="font-medium text-slate-700">{fmtDate(event.startDate)}</dd>
                </div>
              )}
              {event.endDate && (
                <div className="flex items-center gap-2">
                  <dt className="w-10 shrink-0 text-slate-400">종료일</dt>
                  <dd className="font-medium text-slate-700">{fmtDate(event.endDate)}</dd>
                </div>
              )}
              {event.unitPrice != null && (
                <div className="flex items-center gap-2">
                  <dt className="w-10 shrink-0 text-slate-400">보관료</dt>
                  <dd className="font-semibold text-indigo-600">{won(event.unitPrice)}</dd>
                </div>
              )}
              {/* [출고 위치 명시] 출고 완료 건은 백엔드가 '출고 시점에 비운 자리'를 되짚어
                  event.location으로 내려준다(컨테이너가 이후 다른 계약에 재배정되기 전까지만
                  추적 가능) — 있으면 창고+층·번호까지, 없으면(오래된 건 등) 창고명만 보여준다.
                  입고는 기존처럼 현재 점유 위치를 창고+자리로 보여준다. */}
              {event.warehouseName && (
                <div className="flex items-center gap-2">
                  <dt className="w-10 shrink-0 text-slate-400">위치</dt>
                  <dd className="font-medium text-slate-700">
                    {event.type === 'OUTBOUND'
                      ? `${event.warehouseName}${event.location ? ` · ${event.location}` : ''}`
                      : `${event.warehouseName}${event.location ? ` · ${event.location}` : ' · 위치 미배정'}`}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </div>

      {/* 유형별 퀵 액션 — 순서: 출고, 정산, 수정, 삭제 (컨테이너관리 액션 패널과 통일) */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(event.type === 'INBOUND' || event.type === 'OUTBOUND') && (
          <>
            {/* [버그 수정] event.status는 이 카드 자체(입고 또는 출고)의 완료 여부라, 입고 카드는
                입고일이 지나면 항상 COMPLETED라 출고 버튼이 영영 안 보였다 — 이미 출고 완료된
                계약은 다시 출고할 필요가 없다는 의도는 '출고' 타입 카드에만 적용해야 한다.
                (버튼을 눌러 여는 StatusChangeModal은 최신 계약 상태를 다시 조회해 반영하므로,
                 뒤늦게 다른 달에서 이미 출고된 계약의 입고 카드를 봐도 안전하게 동작한다.) */}
            {!(event.type === 'OUTBOUND' && event.status === 'COMPLETED') && (
              <QuickBtn onClick={() => onOutbound(event.id)} disabled={actionLoading} icon={<LogOut size={13} />} tone="amber">
                출고
              </QuickBtn>
            )}
            <QuickBtn onClick={() => onBilling(event.id)} disabled={actionLoading} icon={<Wallet size={13} />} tone="emerald">
              정산
            </QuickBtn>
            <QuickBtn onClick={() => onEdit(event.id)} disabled={actionLoading} icon={<Pencil size={13} />}>
              수정
            </QuickBtn>
            {isAdmin && (
              <QuickBtn onClick={() => onDelete(event)} icon={<Trash2 size={13} />} tone="red">
                삭제
              </QuickBtn>
            )}
          </>
        )}
        {event.type === 'BILLING' && (
          <>
            {/* [딥링크] 청구 이벤트의 id = 원장 id — 청구·정산 화면의 해당 원장 상세를 바로 연다 */}
            <QuickBtn onClick={() => navigate(`/billing?ledger=${event.id}`)} icon={<ArrowRightLeft size={13} />}>
              원장 상세
            </QuickBtn>
            {event.status !== 'COMPLETED' && (
              <>
                <QuickBtn onClick={settlePayment} disabled={busy} icon={<CheckCircle2 size={13} />} tone="emerald">
                  입금 완료 처리
                </QuickBtn>
                {isAdmin && (
                  <QuickBtn onClick={resendNotify} disabled={busy} icon={<Bell size={13} />}>
                    알림톡 재발송
                  </QuickBtn>
                )}
              </>
            )}
          </>
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
  tone?: 'slate' | 'emerald' | 'red' | 'amber'
}) {
  const cls =
    tone === 'emerald'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
        : tone === 'amber'
          ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
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
