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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
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
            <StatCard label="미수금 총액" value={won(stats.outstanding)} icon={Wallet} tone="amber" />
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
