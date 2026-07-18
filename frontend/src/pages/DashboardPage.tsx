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
import StatCard from '@/components/ui/StatCard'
import RevenueBarChart, { type RevenuePoint } from '@/components/charts/RevenueBarChart'
import WarehouseArt from '@/components/brand/WarehouseArt'
import { authStorage } from '@/lib/auth'

import { isOverdue, isOpenLedger, daysFromDue } from '@/lib/billing'
import { calcDailyFee } from '@/lib/fee'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const isActive = (s: StorageOrder['status']) => s === 'RECEIVED' || s === 'IN_STORAGE'

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

        // 최근 계약의 warehouse ID만 추출
        const recentWarehouseIds = Array.from(new Set(o.slice(0, 5).map((order) => order.warehouseId)))

        // 그 warehouse들의 슬롯만 조회 (필요한 것만)
        if (recentWarehouseIds.length > 0) {
          Promise.all(
            recentWarehouseIds.map((warehouseId) =>
              yardApi.slots(warehouseId).catch(() => [] as YardSlot[]),
            ),
          )
            .then((results) => {
              setSlots(results.flat())
            })
            .catch(() => {
              // 슬롯 조회 실패해도 무시
            })
        }
      })
      .finally(() => setLoading(false))

    // 컨테이너는 별도 비동기 로드 (에러 무시)
    containerApi.list({}).then(setContainers).catch(() => {
      // 에러 무시
    })
  }, [])

  const stats = useMemo(() => {
    const t = today()
    const activeContracts = orders.filter((o) => isActive(o.status)).length
    const outstanding = ledgers.filter((l) => l.status !== 'CANCELED').reduce((s, l) => s + l.balance, 0)
    const overdue = ledgers.filter(isOverdue).length
    // 이번 주 납기 도래 — 연체가 되기 전에 잡는 선행 지표
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

  // 최근 6개월 청구/수금 집계 (원장 청구기간 시작월 기준)
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
                <RevenueBarChart data={revenueSeries} />
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
                    const location = getSlotLocation(o.id, containers, slots)
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
