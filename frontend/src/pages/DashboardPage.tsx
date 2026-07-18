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
import { billingApi, type BillingLedger } from '@/api/billingApi'
import { yardApi, type WarehouseOccupancy, type YardSlot } from '@/api/yardApi'
import { containerApi, type Container } from '@/api/containerApi'
import RevenueBarChart, { type RevenuePoint } from '@/components/charts/RevenueBarChart'
import { authStorage } from '@/lib/auth'

import { isOverdue, isOpenLedger, daysFromDue } from '@/lib/billing'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
// [2단계 상태] 입고(INBOUND)만 진행중으로 집계
const isActive = (s: StorageOrder['status']) => s === 'INBOUND'

/* ===== Anthropic 브랜드 액센트 (오렌지·블루·그린 순환) ===== */
const ACCENTS = {
  orange: { fg: '#d97757', bg: 'rgba(217,119,87,0.10)', ring: 'rgba(217,119,87,0.22)' },
  blue: { fg: '#6a9bcc', bg: 'rgba(106,155,204,0.12)', ring: 'rgba(106,155,204,0.24)' },
  green: { fg: '#788c5d', bg: 'rgba(120,140,93,0.12)', ring: 'rgba(120,140,93,0.24)' },
  ink: { fg: '#8a8578', bg: 'rgba(20,20,19,0.05)', ring: 'rgba(20,20,19,0.10)' },
} as const
type AccentKey = keyof typeof ACCENTS

/** 계약의 기간을 일 단위로 계산 */
function getDurationDays(startDate: string, endDate: string | null | undefined): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate ?? startDate}T00:00:00Z`).getTime()
  return Math.round((end - start) / 86_400_000) + 1 // 당일 포함
}

/** 계약 가격 표시: "보관료 / 보관일수" 형식 */
function formatContractPrice(monthlyFee: number, startDate: string, endDate: string | null | undefined): string {
  const durationDays = getDurationDays(startDate, endDate)
  if (durationDays <= 0) return won(monthlyFee)
  return `${won(monthlyFee)} / ${durationDays}일`
}

/** 계약에 배정된 컨테이너의 슬롯 위치 조회 */
function getSlotLocation(orderId: number, containers: Container[], slots: YardSlot[]): string {
  const container = containers.find((c) => c.currentOrderId === orderId)
  if (!container) return ''
  const slot = slots.find((s) => s.containerId === container.id)
  return slot?.locationLabel ?? ''
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      orderApi.list().catch(() => [] as StorageOrder[]),
      billingApi.list().catch(() => [] as BillingLedger[]),
      yardApi.tenantOccupancy().catch(() => [] as WarehouseOccupancy[]),
    ])
      .then(([o, l, occ]) => {
        setOrders(o)
        setLedgers(l)
        setOccupancy(occ)

        const recentWarehouseIds = Array.from(new Set(o.slice(0, 5).map((order) => order.warehouseId)))
        if (recentWarehouseIds.length > 0) {
          Promise.all(
            recentWarehouseIds.map((warehouseId) => yardApi.slots(warehouseId).catch(() => [] as YardSlot[])),
          )
            .then((results) => setSlots(results.flat()))
            .catch(() => {})
        }
      })
      .finally(() => setLoading(false))

    containerApi.list({}).then(setContainers).catch(() => {})
  }, [])

  const stats = useMemo(() => {
    const t = today()
    const activeContracts = orders.filter((o) => isActive(o.status)).length
    const outstanding = ledgers.filter((l) => l.status !== 'CANCELED').reduce((s, l) => s + l.balance, 0)
    const overdue = ledgers.filter(isOverdue).length
    const dueSoonList = ledgers.filter(isDueSoon)
    const dueSoon = dueSoonList.length
    const dueSoonAmount = dueSoonList.reduce((s, l) => s + l.balance, 0)

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

  const revenueSeries = useMemo<RevenuePoint[]>(() => {
    const now = new Date()
    const buckets: Array<{ key: string; label: string; billed: number; collected: number }> = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${d.getMonth() + 1}월`,
        billed: 0,
        collected: 0,
      })
    }
    const idx = new Map(buckets.map((b, i) => [b.key, i]))
    for (const l of ledgers) {
      if (l.status === 'CANCELED' || !l.periodStart) continue
      const key = l.periodStart.slice(0, 7)
      const i = idx.get(key)
      if (i == null) continue
      buckets[i].billed += l.baseAmount + l.carriedOverIn + l.adjustmentTotal
      buckets[i].collected += l.paidTotal
    }
    return buckets.map((b) => ({ label: b.label, billed: b.billed, collected: b.collected }))
  }, [ledgers])

  const hasRevenue = revenueSeries.some((p) => p.billed > 0 || p.collected > 0)

  return (
    <div className="claude-canvas -mx-4 -my-4 min-h-full px-4 py-6 sm:-mx-6 sm:-my-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ===== 히어로 — 웜 잉크 서피스 ===== */}
        <section className="claude-hero relative overflow-hidden rounded-[1.5rem] px-6 py-9 sm:px-9 sm:py-11">
          <div className="claude-grain absolute inset-0 opacity-60" />
          <div className="relative max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-xs font-medium tracking-wide text-[#e8e6dc] backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-[#d97757]" />
              Smart Yard &amp; Warehouse
            </span>
            <h1 className="font-display mt-4 text-[1.75rem] font-semibold leading-tight text-[#faf9f5] sm:text-[2rem]">
              안녕하세요, {user?.name ?? ''}님
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[#b0aea5]">
              오늘의 입출고 · 보관 · 정산 현황을 한눈에 정리했습니다.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-[#8a8578]">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">지표 불러오는 중…</span>
          </div>
        ) : (
          <>
            {/* ===== KPI ===== */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Kpi label="진행중 계약" value={`${stats.activeContracts}`} unit="건" icon={FileText} accent="orange" />
              <Kpi label="미수금 총액" value={won(stats.outstanding)} icon={Wallet} accent="blue" />
              <Kpi
                label="보관비율"
                value={`${stats.usage}`}
                unit="%"
                sub={`${stats.occupiedSlots.toLocaleString('ko-KR')} / ${stats.totalSlots.toLocaleString('ko-KR')} 슬롯`}
                icon={Grid3x3}
                accent="green"
              />
              <Kpi
                label="이번 주 납기 도래"
                value={`${stats.dueSoon}`}
                unit="건"
                sub={stats.dueSoon > 0 ? `${won(stats.dueSoonAmount)} 입금 예정` : '납기 임박 없음'}
                icon={CalendarClock}
                accent="blue"
              />
              <Kpi label="연체 청구" value={`${stats.overdue}`} unit="건" icon={AlertTriangle} accent={stats.overdue > 0 ? 'orange' : 'ink'} />
            </div>

            {/* ===== 월별 청구·수금 추이 ===== */}
            <section className="claude-card p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[15px] font-semibold text-[#2a2723]">월별 청구 · 수금 추이</h2>
                <span className="text-xs text-[#a8a496]">최근 6개월</span>
              </div>
              {hasRevenue ? (
                <div className="mt-5">
                  <RevenueBarChart data={revenueSeries} />
                </div>
              ) : (
                <p className="py-14 text-center text-sm text-[#a8a496]">
                  아직 청구 데이터가 없습니다. 계약과 청구 원장이 쌓이면 추이가 표시됩니다.
                </p>
              )}
            </section>

            {/* ===== 오늘의 입출고 + 최근 계약 ===== */}
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="claude-card p-6 sm:p-7">
                <h2 className="font-display text-[15px] font-semibold text-[#2a2723]">오늘의 입출고</h2>
                <div className="mt-5 space-y-4">
                  <TodayRow icon={<PackageOpen size={18} />} accent="blue" label="입고 예정" items={stats.todayInbound.map((o) => o.customerName)} />
                  <TodayRow icon={<Truck size={18} />} accent="orange" label="출고 예정" items={stats.todayOutbound.map((o) => o.customerName)} />
                </div>
                <Link
                  to="/calendar"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#c1663f] transition hover:gap-1.5 hover:text-[#a6522f]"
                >
                  캘린더에서 보기 <ArrowRight size={14} />
                </Link>
              </section>

              <section className="claude-card p-6 sm:p-7 lg:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-[15px] font-semibold text-[#2a2723]">최근 계약</h2>
                  <Link to="/orders" className="text-xs font-medium text-[#c1663f] transition hover:text-[#a6522f]">
                    전체 보기
                  </Link>
                </div>
                {recentOrders.length === 0 ? (
                  <p className="mt-8 text-center text-sm text-[#a8a496]">등록된 계약이 없습니다.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-[#efede4]">
                    {recentOrders.map((o) => {
                      const location = getSlotLocation(o.id, containers, slots)
                      return (
                        <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1efe6] text-xs font-semibold text-[#78715a]">
                              {o.customerName?.trim()?.[0] ?? '·'}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-[#2a2723]">{o.customerName}</p>
                              <p className="truncate text-xs text-[#a8a496]">
                                {o.warehouseName}
                                {location && ` · ${location}`} · {o.storageStartDate}~{o.actualEndDate ?? o.expectedEndDate ?? '미정'}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-[#4a463e]">
                            {formatContractPrice(o.monthlyFee, o.storageStartDate, o.actualEndDate ?? o.expectedEndDate)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            {/* ===== 바로가기 ===== */}
            <section className="grid gap-4 sm:grid-cols-3">
              <QuickLink to="/orders" icon={FileText} title="계약 등록" desc="새 보관 계약 만들기" accent="orange" />
              <QuickLink to="/yard" icon={Grid3x3} title="보관창고 현황" desc="배치 · 공실률 보기" accent="green" />
              <QuickLink to="/billing" icon={Wallet} title="청구 · 정산" desc="미수금 · 수금 관리" accent="blue" />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

/* ===== KPI 카드 ===== */
function Kpi({
  label,
  value,
  unit,
  sub,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  icon: LucideIcon
  accent: AccentKey
}) {
  const a = ACCENTS[accent]
  return (
    <div className="claude-card claude-card-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#8a8578]">{label}</span>
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full ring-1"
          style={{ backgroundColor: a.bg, color: a.fg, boxShadow: `inset 0 0 0 1px ${a.ring}` }}
        >
          <Icon size={15} />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-display text-2xl font-semibold tracking-tight text-[#1f1d1a]">{value}</span>
        {unit && <span className="text-sm font-medium text-[#8a8578]">{unit}</span>}
      </div>
      {sub && <p className="mt-1 truncate text-xs text-[#a8a496]">{sub}</p>}
    </div>
  )
}

function TodayRow({
  icon,
  accent,
  label,
  items,
}: {
  icon: React.ReactNode
  accent: AccentKey
  label: string
  items: string[]
}) {
  const a = ACCENTS[accent]
  return (
    <div className="flex items-start gap-3">
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: a.bg, color: a.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#4a463e]">{label}</span>
          <span className="font-display text-sm font-semibold text-[#2a2723]">{items.length}건</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-[#a8a496]">{items.length > 0 ? items.join(', ') : '예정 없음'}</p>
      </div>
    </div>
  )
}

function QuickLink({
  to,
  icon: Icon,
  title,
  desc,
  accent,
}: {
  to: string
  icon: LucideIcon
  title: string
  desc: string
  accent: AccentKey
}) {
  const a = ACCENTS[accent]
  return (
    <Link to={to} className="claude-card claude-card-hover group flex items-center gap-4 p-5">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: a.bg, color: a.fg }}
      >
        <Icon size={20} />
      </div>
      <div className="flex-1">
        <p className="font-display text-sm font-semibold text-[#2a2723]">{title}</p>
        <p className="mt-0.5 text-sm text-[#8a8578]">{desc}</p>
      </div>
      <ArrowRight size={18} className="text-[#cfc9bd] transition group-hover:translate-x-0.5" />
    </Link>
  )
}
