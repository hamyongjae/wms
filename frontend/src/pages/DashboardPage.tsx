import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  FileText,
  Wallet,
  Grid3x3,
  AlertTriangle,
  PackageOpen,
  Truck,
  CalendarClock,
  CalendarDays,
  Warehouse,
  ChevronLeft,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { billingApi, type BillingLedger, type MonthlyRevenuePoint } from '@/api/billingApi'
import { yardApi, type WarehouseOccupancy, type YardSlot } from '@/api/yardApi'
import { containerApi, type Container } from '@/api/containerApi'
import StatCard from '@/components/ui/StatCard'
import DateRangeLabel from '@/components/ui/DateRangeLabel'
import YearPickerModal from '@/components/ui/YearPickerModal'
import RevenueBarChart, { type RevenuePoint } from '@/components/charts/RevenueBarChart'
import WarehouseArt from '@/components/brand/WarehouseArt'
import { authStorage } from '@/lib/auth'
import { orderSync } from '@/lib/orderEvents'

import { isOverdue, isOpenLedger, daysFromDue } from '@/lib/billing'
import { today, getDurationDays } from '@/lib/dates'

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const isActive = (s: StorageOrder['status']) => s === 'INBOUND'
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 계약 가격 표시: "보관료 / 보관일수" 형식.
 * 출고 예정일이 없는 장기 계약은 총 계약일수가 아니라 '오늘까지 진행된 일수'이므로
 * 나중에 총액으로 오인하지 않도록 "(진행중)"을 덧붙인다.
 */
function formatContractPrice(monthlyFee: number, startDate: string, endDate: string | null | undefined): string {
  const durationDays = getDurationDays(startDate, endDate)
  if (durationDays <= 0) return won(monthlyFee)
  return `${won(monthlyFee)} / ${durationDays}일${endDate ? '' : ' (진행중)'}`
}

/** 계약 id → 슬롯 위치 라벨 맵 파생 (Map 조인 — 렌더 중 반복 탐색 제거) */
function buildLocationMap(containers: Container[], slots: YardSlot[]): Map<number, string> {
  const locByContainer = new Map<number, string>()
  for (const s of slots) {
    if (s.containerId != null) locByContainer.set(s.containerId, s.locationLabel)
  }
  const m = new Map<number, string>()
  for (const c of containers) {
    if (c.currentOrderId == null) continue
    const loc = locByContainer.get(c.id)
    if (loc) m.set(c.currentOrderId, loc)
  }
  return m
}


/** [연체 예방 지표] 납기 7일 이내로 다가온 입금예정 원장 (오늘 포함, 연체 제외) */
const isDueSoon = (l: BillingLedger) => {
  if (!isOpenLedger(l) || l.balance <= 0 || l.dueDate == null) return false
  const d = daysFromDue(l.dueDate) // 음수 = 납기 전
  return d >= -7 && d <= 0
}

export default function DashboardPage() {
  const user = authStorage.getUser()

  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [ledgers, setLedgers] = useState<BillingLedger[]>([])
  const [occupancy, setOccupancy] = useState<WarehouseOccupancy[]>([])
  const [containers, setContainers] = useState<Container[]>([])
  const [slots, setSlots] = useState<YardSlot[]>([])
  const [revenueSeries, setRevenueSeries] = useState<MonthlyRevenuePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  // [제로 클릭 실시간 동기화] 계약/정산 액션(입출고·수금·환불 완료 등)이 버스로 알리면 즉시 재조회.
  useEffect(() => orderSync.subscribe(() => setRefreshKey((k) => k + 1)), [])

  // [현장 자동 갱신] 수동 새로고침 없이 60초마다 최신화 (탭이 화면에 보일 때만 — 배터리·서버 부담 최소화)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1)
    }, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let alive = true // 언마운트 후 setState 방지 (메모리 릭 차단)

    // [1차] 핵심 지표 — 병렬 로드 후 즉시 렌더 (차트 집계는 서버 GROUP BY로 별도 로드)
    Promise.all([
      orderApi.list().catch(() => [] as StorageOrder[]),
      billingApi.list().catch(() => [] as BillingLedger[]),
      yardApi.tenantOccupancy().catch(() => [] as WarehouseOccupancy[]),
      billingApi.monthlyStats(6).catch(() => [] as MonthlyRevenuePoint[]),
    ])
      .then(([o, l, occ, rev]) => {
        if (!alive) return
        setOrders(o)
        setLedgers(l)
        setOccupancy(occ)
        setRevenueSeries(rev)

        // [2차] 슬롯 위치는 부가 정보 — 컨테이너를 먼저 받아
        //   "최근 5건 계약에 실제 배정된 컨테이너가 있는 창고"만 슬롯을 조회한다.
        //   (배정이 없으면 슬롯 API를 아예 호출하지 않음 → 네트워크 오버헤드 최소화)
        const recentIds = new Set(o.slice(0, 5).map((ord) => ord.id))
        containerApi
          .list({})
          .then((cts) => {
            if (!alive) return
            setContainers(cts)
            const neededWarehouseIds = [
              ...new Set(
                cts
                  .filter((c) => c.currentOrderId != null && recentIds.has(c.currentOrderId))
                  .map((c) => c.warehouseId),
              ),
            ]
            if (neededWarehouseIds.length === 0) return
            return Promise.all(
              neededWarehouseIds.map((wid) => yardApi.slots(wid).catch(() => [] as YardSlot[])),
            ).then((results) => {
              if (alive) setSlots(results.flat())
            })
          })
          .catch(() => {}) // 부가 정보 실패는 조용히 무시
      })
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
  }, [refreshKey])

  const stats = useMemo(() => {
    const t = today()
    const activeContracts = orders.filter((o) => isActive(o.status)).length
    // [정산관리와 동기화] 미수금은 양수 잔액(outstanding)만 합산 — 과오납(음수/환불 대상)이 총액을 갉지 않도록.
    const outstanding = ledgers
      .filter((l) => l.status !== 'CANCELED')
      .reduce((s, l) => s + (l.outstanding ?? Math.max(l.balance, 0)), 0)
    const overdue = ledgers.filter(isOverdue).length
    // 이번 주 납기 도래 — 연체가 되기 전에 잡는 선행 지표
    const dueSoonList = ledgers.filter(isDueSoon)
    const dueSoon = dueSoonList.length
    const dueSoonAmount = dueSoonList.reduce((s, l) => s + (l.outstanding ?? Math.max(l.balance, 0)), 0)

    const totalSlots = occupancy.reduce((s, w) => s + w.totalSlots, 0)
    const occupiedSlots = occupancy.reduce((s, w) => s + w.occupiedSlots, 0)
    const usage = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0

    const todayInbound = orders.filter((o) => o.storageStartDate === t)
    const todayOutbound = orders.filter(
      (o) => o.actualEndDate === t || (o.expectedEndDate === t && isActive(o.status)),
    )

    return { activeContracts, outstanding, overdue, dueSoon, dueSoonAmount, totalSlots, occupiedSlots, usage, todayInbound, todayOutbound }
  }, [orders, ledgers, occupancy])

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders])
  const locationByOrder = useMemo(() => buildLocationMap(containers, slots), [containers, slots])

  // 월별 청구/수금 추이 — 서버 GROUP BY 집계 결과를 그대로 차트 포인트로 사용 (앱단 풀스캔 제거).
  // orderSync 이벤트로 재조회되므로 정산 액션 후에도 새로고침 없이 최신 확정 금액이 반영된다.
  const revenueChart = useMemo<RevenuePoint[]>(
    () => revenueSeries.map((p) => ({ label: p.label, billed: p.billed, collected: p.collected })),
    [revenueSeries],
  )

  const hasRevenue = revenueChart.some((p) => p.billed > 0 || p.collected > 0)

  // ===== [모바일 전용] 파생 데이터: 지연 출고·잔여 공간·달력 이벤트 =====
  const mobile = useMemo(() => {
    const t = today()
    const [yy, mm, dd] = t.split('-').map(Number)

    // 출고 예정일이 지났는데 아직 보관 중(INBOUND) → 현장 '막힘' 신호
    const delayedOut = orders.filter(
      (o) => isActive(o.status) && o.expectedEndDate != null && o.expectedEndDate < t,
    )
    const remaining = Math.max(stats.totalSlots - stats.occupiedSlots, 0)

    // 달력 이벤트는 '보고 있는 달'이 바뀔 때마다 달라지므로 MobileScheduleCard 내부에서 계산한다.
    return { year: yy, month: mm, todayDay: dd, delayedOut, remaining }
  }, [orders, stats])

  // 상단 긴급 배너에 띄울 항목(연체·출고 지연)
  const urgentItems: string[] = []
  if (stats.overdue > 0) urgentItems.push(`연체 청구 ${stats.overdue}건`)
  if (mobile.delayedOut.length > 0) urgentItems.push(`출고 지연 ${mobile.delayedOut.length}건`)

  return (
    <>
      {/* ===================== 모바일 전용 대시보드 (md 미만) ===================== */}
      <div className="space-y-4 md:hidden">
        {/* 인사 */}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-base">불러오는 중…</span>
          </div>
        ) : (
          <>
            {/* [최상단] 긴급 알림 — 있을 때만 노출. 화면을 압도하지 않는 차분한 톤 */}
            {urgentItems.length > 0 && (
              <Link
                to={stats.overdue > 0 ? '/billing?filter=OVERDUE' : '/yard'}
                className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 transition active:bg-red-100"
              >
                <AlertTriangle size={20} className="shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-red-700">지금 확인이 필요해요</p>
                  <p className="truncate text-xs text-red-500">{urgentItems.join(' · ')}</p>
                </div>
                <ChevronRight size={18} className="shrink-0 text-red-300" />
              </Link>
            )}

            {/* 오늘의 입출고 — 카드 자체가 큰 터치 버튼. 눌러서 계약관리의 '오늘 그 항목'으로 원터치 진입 */}
            <MobileCard title="오늘의 입출고" icon={CalendarDays}>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/orders?today=inbound"
                  className="rounded-2xl bg-blue-50 p-4 text-center transition active:scale-[0.98] active:bg-blue-100"
                >
                  <PackageOpen className="mx-auto text-blue-600" size={28} />
                  <p className="mt-1 text-4xl font-extrabold text-blue-700">{stats.todayInbound.length}</p>
                  <p className="text-sm font-semibold text-blue-600">입고</p>
                </Link>
                <Link
                  to="/orders?today=outbound"
                  className="rounded-2xl bg-orange-50 p-4 text-center transition active:scale-[0.98] active:bg-orange-100"
                >
                  <Truck className="mx-auto text-orange-600" size={28} />
                  <p className="mt-1 text-4xl font-extrabold text-orange-700">{stats.todayOutbound.length}</p>
                  <p className="text-sm font-semibold text-orange-600">출고</p>
                </Link>
              </div>
            </MobileCard>

            {/* 입출고 일정 (달력 + 선택일 화주) */}
            <MobileScheduleCard
              orders={orders}
              year={mobile.year}
              month={mobile.month}
              todayDay={mobile.todayDay}
            />

            {/* 현재 창고 잔여 공간 */}
            <MobileCard title="현재 창고 잔여 공간" icon={Warehouse}>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-5xl font-extrabold leading-none text-slate-800">
                    {mobile.remaining.toLocaleString('ko-KR')}
                    <span className="ml-1 text-xl font-bold text-slate-400">칸 남음</span>
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    사용 {stats.occupiedSlots.toLocaleString('ko-KR')} / 전체 {stats.totalSlots.toLocaleString('ko-KR')}칸
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-indigo-600">{stats.usage}%</p>
                  <p className="text-xs text-slate-400">사용률</p>
                </div>
              </div>
              <div className="mt-4 h-4 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all ${stats.usage >= 90 ? 'bg-red-500' : stats.usage >= 70 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                  style={{ width: `${stats.usage}%` }}
                />
              </div>
            </MobileCard>

          </>
        )}
      </div>

      {/* ===================== 데스크톱 대시보드 (md 이상) — 기존 유지 ===================== */}
      <div className="mx-auto hidden max-w-6xl space-y-6 md:block">
        {/* 히어로 배너 — 스마트 창고 비주얼 결합 */}
        <section className="bg-brand-hero relative overflow-hidden rounded-2xl px-6 py-7 shadow-sm sm:px-8">
          <div className="bg-node-dots absolute inset-0 opacity-50" />
          <WarehouseArt className="pointer-events-none absolute -right-6 top-1/2 hidden h-[150%] max-w-none -translate-y-1/2 opacity-90 md:block md:w-[46%]" />
          <div className="relative max-w-lg">
            <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100 backdrop-blur">
              Smart Yard &amp; Warehouse
            </span>
            <h2 className="mt-3 text-2xl font-bold text-white">
              안녕하세요, {user?.name ?? ''}님 👋
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              오늘의 입출고·보관·정산 현황을 한눈에 확인하세요.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">지표 불러오는 중…</span>
          </div>
        ) : (
          <>
            {/* KPI */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard label="진행중 계약" value={`${stats.activeContracts}건`} icon={FileText} tone="indigo" />

              <StatCard
                label="보관비율"
                value={`${stats.usage}%`}
                sub={`${stats.occupiedSlots.toLocaleString('ko-KR')}/${stats.totalSlots.toLocaleString('ko-KR')} 슬롯`}
                icon={Grid3x3}
                tone="emerald"
              />
              {/* 납기 도래(7일) — 연체를 만들기 전에 잡는 선행 지표 */}
              <StatCard
                label="이번 주 납기 도래"
                value={`${stats.dueSoon}건`}
                sub={stats.dueSoon > 0 ? `${won(stats.dueSoonAmount)} 입금 예정` : '납기 임박 건 없음'}
                icon={CalendarClock}
                tone="indigo"
              />
              <StatCard label="연체 청구" value={`${stats.overdue}건`} icon={AlertTriangle} tone="slate" />
              <StatCard label="미수금 총액" value={won(stats.outstanding)} icon={Wallet} tone="amber" />
            </div>

            {/* 월별 청구·수금 추이 */}
            <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">월별 청구 · 수금 추이</h3>
                <span className="text-xs text-slate-400">최근 6개월</span>
              </div>
              {hasRevenue ? (
                <div className="mt-4">
                  <RevenueBarChart data={revenueChart} />
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-slate-400">
                  아직 정산 데이터가 없습니다. 계약과 정산서가 쌓이면 추이가 표시됩니다.
                </p>
              )}
            </section>

            {/* 오늘의 입출고 + 최근 계약 */}
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
                <h3 className="text-sm font-semibold text-slate-700">오늘의 입출고</h3>
                <div className="mt-4 space-y-3">
                  <TodayRow
                    icon={<PackageOpen size={18} />}
                    tone="blue"
                    label="입고 예정"
                    items={stats.todayInbound.map((o) => o.customerName)}
                  />
                  <TodayRow
                    icon={<Truck size={18} />}
                    tone="orange"
                    label="출고 예정"
                    items={stats.todayOutbound.map((o) => o.customerName)}
                  />
                </div>
                <Link
                  to="/calendar"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                >
                  캘린더에서 보기 <ArrowRight size={14} />
                </Link>
              </section>

              <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">최근 계약</h3>
                  <Link to="/orders" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    전체 보기
                  </Link>
                </div>
                {recentOrders.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-slate-400">등록된 계약이 없습니다.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100">
                    {recentOrders.map((o) => {
                      const location = locationByOrder.get(o.id) ?? ''
                      return (
                        <li key={o.id} className="flex items-center justify-between py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">{o.customerName}</p>
                            <p className="text-xs text-slate-400">
                              {o.warehouseName} {location && `· ${location}`} ·{' '}
                              <DateRangeLabel start={o.storageStartDate} end={o.actualEndDate ?? o.expectedEndDate} size="sm" />
                            </p>
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-slate-600">{formatContractPrice(o.monthlyFee, o.storageStartDate, o.actualEndDate ?? o.expectedEndDate)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            {/* 바로가기 */}
            <section className="grid gap-4 sm:grid-cols-3">
              <QuickLink to="/orders" icon={FileText} title="계약 등록" desc="새 보관 계약 만들기" />
              <QuickLink to="/yard" icon={Grid3x3} title="보관창고 현황" desc="배치·공실률 보기" />
              <QuickLink to="/billing" icon={Wallet} title="청구·정산" desc="미수금·입금 관리" />
            </section>
          </>
        )}
      </div>
    </>
  )
}

/* ===== 모바일 카드 래퍼 ===== */
function MobileCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string
  icon: LucideIcon
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <Icon size={19} className="text-indigo-600" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/* ===== 모바일 입출고 일정 카드 (달력 + 선택일 화주) ===== */
function MobileScheduleCard({
  orders,
  year,
  month,
  todayDay,
}: {
  orders: StorageOrder[]
  /** 오늘 기준 연/월/일 — 달력의 '이번 달' 기준점이자 오늘 강조 표시의 기준 */
  year: number
  month: number
  todayDay: number
}) {
  // [월 이동] 보고 있는 달. 오늘이 속한 달에서 시작해 이전/다음 버튼으로 자유롭게 이동한다.
  const [view, setView] = useState({ year, month })
  const [selected, setSelected] = useState(todayDay)

  // 오늘 날짜가 바뀌면(자정 넘김·데이터 갱신) 이번 달·오늘로 재동기화
  useEffect(() => {
    setView({ year, month })
    setSelected(todayDay)
  }, [year, month, todayDay])

  // 현재 보고 있는 달이 '이번 달'인지 — 오늘 강조와 '이번 달' 복귀 버튼의 표시 기준
  const isCurrentMonth = view.year === year && view.month === month

  /**
   * [월 이동] delta(-1/+1)만큼 이동. Date 생성자에 month 인덱스를 그대로 넘겨
   * 12월→1월, 1월→12월의 연도 넘김을 자동 처리한다(직접 나머지 연산하면 실수하기 쉬운 지점).
   * 이동 후 선택일은 이번 달이면 오늘, 아니면 1일로 맞춘다 — 존재하지 않는 날짜(31일→2월)를 피한다.
   */
  function shiftMonth(delta: number) {
    const d = new Date(view.year, view.month - 1 + delta, 1)
    const ny = d.getFullYear()
    const nm = d.getMonth() + 1
    setView({ year: ny, month: nm })
    setSelected(ny === year && nm === month ? todayDay : 1)
    setSlideFrom(delta) // 넘어온 방향으로 슬라이드 애니메이션
  }

  // [연도 빠른 이동] 월 화살표만으로는 몇 년 전/후로 가기 번거로워, 연도 라벨 탭으로 바로 이동한다
  const [yearPickerOpen, setYearPickerOpen] = useState(false)
  function selectYear(y: number) {
    setView((v) => ({ year: y, month: v.month }))
    setSelected(y === year && view.month === month ? todayDay : 1)
    setYearPickerOpen(false)
  }

  /*
   * ===== [스와이프 월 이동] =====
   * 달력을 좌우로 밀어서 달을 넘긴다. 이 카드는 세로 스크롤 컨테이너 안에 있으므로
   * '가로 제스처만' 골라내는 축 판정이 핵심이다. 잘못 만들면 페이지 스크롤이 씹힌다.
   *
   *  1) touchstart 에서 시작 좌표만 기록 (아직 아무 판단도 하지 않는다)
   *  2) touchmove 에서 축을 한 번만 확정(axis lock):
   *       |dx| > |dy| 이고 |dx| >= 10px  →  가로 제스처로 확정
   *       그 외(세로가 우세)              →  이 터치는 스크롤에 양보하고 끝까지 무시
   *     한 번 정해진 축은 손가락을 뗄 때까지 바뀌지 않는다. 손가락이 사선으로 움직여도
   *     중간에 판정이 뒤집혀 스크롤과 스와이프가 번갈아 먹는 현상을 막기 위함이다.
   *  3) touchend 에서 가로로 확정됐고 이동량이 임계값(48px)을 넘었을 때만 월 이동
   *
   * preventDefault 는 호출하지 않는다. 세로 스크롤을 절대 방해하지 않기 위해서이며,
   * 가로 확정 시엔 어차피 브라우저가 세로 스크롤을 시작하지 않은 상태다.
   */
  const SWIPE_MIN = 48 // 월 이동을 발동시킬 최소 가로 이동량(px)
  const touch = useRef<{ x: number; y: number; axis: 'none' | 'x' | 'y' } | null>(null)
  // 스와이프 직후의 유령 클릭(날짜 선택) 차단 플래그
  const swiped = useRef(false)
  // 슬라이드 애니메이션 방향(-1: 이전 달, +1: 다음 달, 0: 없음)
  const [slideFrom, setSlideFrom] = useState(0)

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, axis: 'none' }
    swiped.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    const s = touch.current
    if (!s || s.axis !== 'none') return // 축이 이미 확정됐으면 재판정하지 않는다
    const t = e.touches[0]
    const dx = Math.abs(t.clientX - s.x)
    const dy = Math.abs(t.clientY - s.y)
    if (dx < 10 && dy < 10) return // 아직 의도를 알 수 없는 미세 움직임 — 판정 보류
    s.axis = dx > dy ? 'x' : 'y'
  }

  function onTouchEnd(e: React.TouchEvent) {
    const s = touch.current
    touch.current = null
    if (!s || s.axis !== 'x') return // 세로 제스처(스크롤)였으면 아무것도 하지 않는다
    const dx = e.changedTouches[0].clientX - s.x
    if (Math.abs(dx) < SWIPE_MIN) return // 임계값 미달 — 실수로 스친 것으로 본다
    swiped.current = true // 이어서 발생할 click(날짜 선택)을 무시하도록 표시
    shiftMonth(dx < 0 ? 1 : -1) // 왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달
  }

  /** 스와이프로 손가락을 뗀 직후 날짜 셀의 click 이 튀는 것을 막는다 */
  function handleSelectDay(d: number) {
    if (swiped.current) {
      swiped.current = false
      return
    }
    setSelected(d)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${view.year}-${pad(view.month)}-${pad(selected)}`

  /**
   * [달력 이벤트] 보고 있는 달의 일자별 입고/출고 건수.
   * 월을 넘길 때마다 그 달 기준으로 다시 집계한다. 서버 재조회 없이 이미 받아둔
   * orders 를 필터링하므로 월 이동이 즉각 반영된다.
   */
  const events = useMemo(() => {
    const cal = new Map<number, { inNames: string[]; outNames: string[] }>()
    const add = (ds: string | null | undefined, key: 'inNames' | 'outNames', name: string) => {
      if (!ds) return
      const [y, m, d] = ds.split('-').map(Number)
      if (y !== view.year || m !== view.month) return
      const e = cal.get(d) ?? { inNames: [], outNames: [] }
      e[key].push(name)
      cal.set(d, e)
    }
    for (const o of orders) {
      add(o.storageStartDate, 'inNames', o.customerName)
      add(o.actualEndDate ?? o.expectedEndDate, 'outNames', o.customerName)
    }
    return cal
  }, [orders, view.year, view.month])
  // 같은 고객이 여러 건이어도 이름은 한 번만 (중복 제거)
  const inNames = [...new Set(orders.filter((o) => o.storageStartDate === dateStr).map((o) => o.customerName))]
  const outNames = [
    ...new Set(
      orders
        .filter((o) => o.actualEndDate === dateStr || (o.expectedEndDate === dateStr && isActive(o.status)))
        .map((o) => o.customerName),
    ),
  ]

  return (
    <section className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <CalendarDays size={19} className="text-indigo-600" />
          입출고 일정
        </h3>
        <Link to="/calendar" className="flex items-center gap-0.5 text-sm font-semibold text-indigo-600">
          전체 <ChevronRight size={15} />
        </Link>
      </div>

      {/* 월 이동 — 좌우 화살표는 44px 터치 타깃(엄지 존 최소 규격)을 확보한다 */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="이전 달"
          className="card-press flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <button
            type="button"
            onClick={() => setYearPickerOpen(true)}
            className="rounded-lg px-1.5 text-base font-bold text-slate-700 transition active:bg-slate-100"
          >
            {view.year}년 {view.month}월
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={() => {
                // 이번 달이 현재 보는 달보다 과거면 오른쪽에서, 미래면 왼쪽에서 들어오도록
                const back = year * 12 + month < view.year * 12 + view.month
                setSlideFrom(back ? -1 : 1)
                setView({ year, month })
                setSelected(todayDay)
              }}
              className="mt-0.5 text-[11px] font-medium text-indigo-600 underline-offset-2 active:underline"
            >
              이번 달로
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="다음 달"
          className="card-press flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 active:bg-slate-100"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      {/*
        스와이프 영역 — 달력 그리드 전체가 제스처를 받는다.
        touch-pan-y: 이 요소에서 세로 스크롤은 브라우저에 맡기고 가로 제스처만 JS가 처리한다고
        선언해, 브라우저가 가로 패닝을 가로채지 않게 한다(스와이프 반응성의 핵심).
      */}
      <div className="touch-pan-y overflow-hidden" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div
          /* key 를 연-월로 두면 달이 바뀔 때마다 새 노드로 마운트돼 슬라이드 애니메이션이 매번 재생된다 */
          key={`${view.year}-${view.month}`}
          className={slideFrom === 0 ? undefined : slideFrom > 0 ? 'animate-cal-in-right' : 'animate-cal-in-left'}
        >
          <MiniCalendar
            year={view.year}
            month={view.month}
            /* 오늘 강조는 이번 달을 보고 있을 때만 — 다른 달의 같은 날짜가 오늘로 보이는 오인을 막는다 */
            todayDay={isCurrentMonth ? todayDay : undefined}
            events={events}
            selectedDay={selected}
            onSelect={handleSelectDay}
          />
        </div>
      </div>

      {/* 선택한 날짜의 입고·출고 화주 */}
      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-base font-bold text-slate-700">
          {view.month}월 {selected}일{isCurrentMonth && selected === todayDay ? ' (오늘)' : ''} 입출고 화주
        </p>
        <div className="mt-2.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-md bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">입고</span>
            <span className="text-base font-medium text-slate-700">{inNames.length ? inNames.join(', ') : '없음'}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded-md bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700">출고</span>
            <span className="text-base font-medium text-slate-700">{outNames.length ? outNames.join(', ') : '없음'}</span>
          </div>
        </div>
      </div>

      <Link
        to="/calendar"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-indigo-100 bg-indigo-50 py-3.5 text-base font-bold text-indigo-700 transition active:scale-[0.99]"
      >
        전체 일정 보기 <ArrowRight size={18} />
      </Link>

      <YearPickerModal
        open={yearPickerOpen}
        onClose={() => setYearPickerOpen(false)}
        year={view.year}
        onSelect={selectYear}
      />
    </section>
  )
}

/* ===== 모바일 미니 달력 (이번 달, 입고=파랑·출고=주황 점, 날짜 탭 선택) ===== */
function MiniCalendar({
  year,
  month,
  todayDay,
  events,
  selectedDay,
  onSelect,
}: {
  year: number
  month: number
  /** 오늘 강조할 일자. 이번 달이 아닌 달을 보고 있으면 undefined */
  todayDay?: number
  events: Map<number, { inNames: string[]; outNames: string[] }>
  selectedDay?: number
  onSelect?: (day: number) => void
}) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold">
        {WEEKDAY.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}>
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} />
          const e = events.get(d)
          const isToday = d === todayDay
          const isSel = d === selectedDay
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onSelect?.(d)}
              className={`flex h-16 flex-col items-center gap-0.5 rounded-xl pt-1.5 text-base transition ${
                isSel
                  ? 'bg-indigo-600 font-bold text-white'
                  : isToday
                    ? 'font-bold text-indigo-700 ring-2 ring-inset ring-indigo-300'
                    : 'font-medium text-slate-700 active:bg-slate-100'
              }`}
            >
              <span>{d}</span>
              {/* 입고·출고 화주명 — 여러 건이면 첫 명 + "외N" 으로 줄여 칸 안에 맞춘다 */}
              <div className="flex w-full flex-col gap-0.5 px-0.5">
                {e && e.inNames.length > 0 && (
                  <span
                    className={`w-full truncate rounded px-1 text-[9px] font-semibold leading-tight ${
                      isSel ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {e.inNames[0]}
                    {e.inNames.length > 1 ? ` 외${e.inNames.length - 1}` : ''}
                  </span>
                )}
                {e && e.outNames.length > 0 && (
                  <span
                    className={`w-full truncate rounded px-1 text-[9px] font-semibold leading-tight ${
                      isSel ? 'bg-white/25 text-white' : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    {e.outNames[0]}
                    {e.outNames.length > 1 ? ` 외${e.outNames.length - 1}` : ''}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-center gap-5 text-sm text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" />입고</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" />출고</span>
      </div>
    </div>
  )
}

function TodayRow({
  icon,
  tone,
  label,
  items,
}: {
  icon: React.ReactNode
  tone: 'blue' | 'orange'
  label: string
  items: string[]
}) {
  const toneCls = tone === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
  return (
    <div className="flex items-start gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">{label}</span>
          <span className="text-sm font-semibold text-slate-800">{items.length}건</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {items.length > 0 ? items.join(', ') : '예정 없음'}
        </p>
      </div>
    </div>
  )
}

function QuickLink({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string
  icon: LucideIcon
  title: string
  desc: string
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60 transition hover:border-indigo-300 hover:shadow"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
        <Icon size={20} />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{desc}</p>
      </div>
      <ArrowRight
        size={18}
        className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
      />
    </Link>
  )
}
