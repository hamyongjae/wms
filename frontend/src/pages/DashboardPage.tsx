import { useEffect, useMemo, useState } from 'react'
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
  Bell,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { billingApi, type BillingLedger, type MonthlyRevenuePoint } from '@/api/billingApi'
import { yardApi, type WarehouseOccupancy, type YardSlot } from '@/api/yardApi'
import { containerApi, type Container } from '@/api/containerApi'
import StatCard from '@/components/ui/StatCard'
import RevenueBarChart, { type RevenuePoint } from '@/components/charts/RevenueBarChart'
import WarehouseArt from '@/components/brand/WarehouseArt'
import { authStorage } from '@/lib/auth'
import { orderSync } from '@/lib/orderEvents'

import { isOverdue, isOpenLedger, daysFromDue } from '@/lib/billing'
import { today, getDurationDays } from '@/lib/dates'

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const isActive = (s: StorageOrder['status']) => s === 'INBOUND'
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 계약 가격 표시: "보관료 / 보관일수" 형식 */
function formatContractPrice(monthlyFee: number, startDate: string, endDate: string | null | undefined): string {
  const durationDays = getDurationDays(startDate, endDate)
  if (durationDays <= 0) return won(monthlyFee)
  return `${won(monthlyFee)} / ${durationDays}일`
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

  // ===== [모바일 전용] 파생 데이터: 지연 출고·잔여 공간·달력 이벤트·주요 알림 =====
  const mobile = useMemo(() => {
    const t = today()
    const [yy, mm, dd] = t.split('-').map(Number)

    // 출고 예정일이 지났는데 아직 보관 중(INBOUND) → 현장 '막힘' 신호
    const delayedOut = orders.filter(
      (o) => isActive(o.status) && o.expectedEndDate != null && o.expectedEndDate < t,
    )
    const remaining = Math.max(stats.totalSlots - stats.occupiedSlots, 0)

    // 이번 달 달력 이벤트 (일자 → 입고/출고 건수)
    const cal = new Map<number, { in: number; out: number }>()
    const add = (ds: string | null | undefined, key: 'in' | 'out') => {
      if (!ds) return
      const [y, m, d] = ds.split('-').map(Number)
      if (y === yy && m === mm) {
        const e = cal.get(d) ?? { in: 0, out: 0 }
        e[key] += 1
        cal.set(d, e)
      }
    }
    for (const o of orders) {
      add(o.storageStartDate, 'in')
      add(o.actualEndDate ?? o.expectedEndDate, 'out')
    }

    // 주요 알림 (심각도 순)
    type Noti = { id: string; text: string; sub?: string; tone: 'red' | 'amber' | 'blue'; to: string }
    const notis: Noti[] = []
    if (stats.overdue > 0)
      notis.push({ id: 'overdue', text: `연체 청구 ${stats.overdue}건`, sub: '납기가 지난 미납 청구가 있어요', tone: 'red', to: '/billing' })
    if (delayedOut.length > 0)
      notis.push({ id: 'delayed', text: `출고 지연 ${delayedOut.length}건`, sub: delayedOut.slice(0, 3).map((o) => o.customerName).join(', '), tone: 'amber', to: '/yard' })
    if (stats.dueSoon > 0)
      notis.push({ id: 'duesoon', text: `이번 주 납기 도래 ${stats.dueSoon}건`, sub: `${won(stats.dueSoonAmount)} 입금 예정`, tone: 'blue', to: '/billing' })

    return { year: yy, month: mm, todayDay: dd, delayedOut, remaining, cal, notis }
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
            {/* [최상단] 긴급 알림 — 있을 때만 크게 노출 */}
            {urgentItems.length > 0 && (
              <Link
                to={stats.overdue > 0 ? '/billing' : '/yard'}
                className="relative block overflow-hidden rounded-2xl bg-red-600 px-5 py-4 shadow-lg shadow-red-600/25"
              >
                <span className="absolute right-4 top-4 flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-white" />
                </span>
                <div className="flex items-center gap-3">
                  <AlertTriangle size={28} className="shrink-0 text-white" />
                  <div>
                    <p className="text-lg font-bold text-white">지금 확인이 필요해요</p>
                    <p className="mt-0.5 text-sm font-medium text-red-50">{urgentItems.join('  ·  ')}</p>
                  </div>
                </div>
                <p className="mt-2 text-right text-sm font-semibold text-red-100">눌러서 확인하기 ›</p>
              </Link>
            )}

            {/* 오늘의 입출고 */}
            <MobileCard title="오늘의 입출고" icon={CalendarDays}>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-blue-50 p-4 text-center">
                  <PackageOpen className="mx-auto text-blue-600" size={28} />
                  <p className="mt-1 text-4xl font-extrabold text-blue-700">{stats.todayInbound.length}</p>
                  <p className="text-sm font-semibold text-blue-600">입고</p>
                </div>
                <div className="rounded-2xl bg-orange-50 p-4 text-center">
                  <Truck className="mx-auto text-orange-600" size={28} />
                  <p className="mt-1 text-4xl font-extrabold text-orange-700">{stats.todayOutbound.length}</p>
                  <p className="text-sm font-semibold text-orange-600">출고</p>
                </div>
              </div>
              {(stats.todayInbound.length > 0 || stats.todayOutbound.length > 0) && (
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  {[...stats.todayInbound, ...stats.todayOutbound].map((o) => o.customerName).join(', ')}
                </p>
              )}
              <Link
                to="/yard"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99]"
              >
                컨테이너 관리에서 처리하기 <ArrowRight size={19} />
              </Link>
            </MobileCard>

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

            {/* 입출고 일정 (달력 + 선택일 화주) */}
            <MobileScheduleCard
              orders={orders}
              year={mobile.year}
              month={mobile.month}
              todayDay={mobile.todayDay}
              events={mobile.cal}
            />

            {/* 주요 알림 */}
            <MobileCard title="주요 알림" icon={Bell}>
              {mobile.notis.length === 0 ? (
                <p className="py-3 text-center text-base text-slate-400">특별한 알림이 없습니다 😊</p>
              ) : (
                <div className="space-y-2.5">
                  {mobile.notis.map((n) => (
                    <Link
                      key={n.id}
                      to={n.to}
                      className={`flex items-center justify-between rounded-2xl border p-4 ${NOTI_TONE[n.tone]}`}
                    >
                      <div className="min-w-0">
                        <p className="text-base font-bold">{n.text}</p>
                        {n.sub && <p className="mt-0.5 truncate text-sm opacity-80">{n.sub}</p>}
                      </div>
                      <ChevronRight size={22} className="shrink-0 opacity-60" />
                    </Link>
                  ))}
                </div>
              )}
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
                  아직 청구 데이터가 없습니다. 계약과 청구 원장이 쌓이면 추이가 표시됩니다.
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
                              {o.warehouseName} {location && `· ${location}`} · {o.storageStartDate}~{o.actualEndDate ?? o.expectedEndDate ?? '미정'}
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
              <QuickLink to="/billing" icon={Wallet} title="청구·정산" desc="미수금·수금 관리" />
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

const NOTI_TONE: Record<'red' | 'amber' | 'blue', string> = {
  red: 'border-red-200 bg-red-50 text-red-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
}

/* ===== 모바일 입출고 일정 카드 (달력 + 선택일 화주) ===== */
function MobileScheduleCard({
  orders,
  year,
  month,
  todayDay,
  events,
}: {
  orders: StorageOrder[]
  year: number
  month: number
  todayDay: number
  events: Map<number, { in: number; out: number }>
}) {
  const [selected, setSelected] = useState(todayDay)
  // 데이터 갱신으로 오늘 날짜가 바뀌면 선택도 오늘로 재동기화
  useEffect(() => setSelected(todayDay), [todayDay, month, year])

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${year}-${pad(month)}-${pad(selected)}`
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

      <p className="mb-2 text-center text-base font-bold text-slate-700">{year}년 {month}월</p>
      <MiniCalendar year={year} month={month} todayDay={todayDay} events={events} selectedDay={selected} onSelect={setSelected} />

      {/* 선택한 날짜의 입고·출고 화주 */}
      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <p className="text-base font-bold text-slate-700">
          {month}월 {selected}일{selected === todayDay ? ' (오늘)' : ''} 입출고 화주
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
  todayDay: number
  events: Map<number, { in: number; out: number }>
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
              className={`relative flex h-11 flex-col items-center justify-center rounded-xl text-base transition ${
                isSel
                  ? 'bg-indigo-600 font-bold text-white'
                  : isToday
                    ? 'font-bold text-indigo-700 ring-2 ring-inset ring-indigo-300'
                    : 'font-medium text-slate-700 active:bg-slate-100'
              }`}
            >
              <span>{d}</span>
              {e && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {e.in > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-blue-500'}`} />}
                  {e.out > 0 && <span className={`h-1.5 w-1.5 rounded-full ${isSel ? 'bg-white' : 'bg-orange-500'}`} />}
                </span>
              )}
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
