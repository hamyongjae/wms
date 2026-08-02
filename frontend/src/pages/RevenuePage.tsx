import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp, FileText, Users, Loader2, PieChart } from 'lucide-react'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { computeRangeRevenue } from '@/lib/revenue'
import { orderSync } from '@/lib/orderEvents'
import { addDays } from '@/lib/dates'
import { cn } from '@/lib/cn'

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const pct = (r: number) => `${Math.round(r * 100)}%`
const dot = (iso: string) => iso.replaceAll('-', '.')

const pad2 = (n: number) => String(n).padStart(2, '0')
/** 해당 연·월(1~12)의 1일~말일 (yyyy-MM-dd) */
function monthBounds(year: number, month1: number): { from: string; to: string } {
  const last = new Date(year, month1, 0).getDate()
  return { from: `${year}-${pad2(month1)}-01`, to: `${year}-${pad2(month1)}-${pad2(last)}` }
}
/** [from, to]가 어떤 달의 1일~말일과 정확히 일치하면 그 달(1~12), 아니면 null */
function fullMonthOf(from: string, to: string): number | null {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  if (fd !== 1 || fy !== ty || fm !== tm) return null
  return td === new Date(fy, fm, 0).getDate() ? fm : null
}

// 고객사별 비중 바 색상
const BAR_COLORS = ['#6366f1', '#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#94a3b8']

export default function RevenuePage() {
  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // [제로 클릭] 진입 즉시 '당월 1일~말일'을 기본 기간으로
  const [range, setRange] = useState(() => {
    const n = new Date()
    return monthBounds(n.getFullYear(), n.getMonth() + 1)
  })

  // 계약은 진입 즉시 자동 로드 (조회 버튼 없음)
  useEffect(() => {
    setLoading(true)
    setError(null)
    orderApi
      .list()
      .then(setOrders)
      .catch(() => setError('매출 데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [refreshKey])

  // [실시간 동기화] 계약 수정·삭제·상태전환 시 매출 즉시 재계산 (새로고침 없음)
  useEffect(() => orderSync.subscribe(() => setRefreshKey((k) => k + 1)), [])

  // 기간이나 계약이 바뀌면 자동 재계산
  const summary = useMemo(
    () => (range.from && range.to ? computeRangeRevenue(orders, range.from, range.to) : computeRangeRevenue(orders, range.from, range.from)),
    [orders, range],
  )

  // 직전 '동일 길이' 기간 대비 증감
  const prevTotal = useMemo(() => {
    if (!range.from || !range.to) return 0
    const prevTo = addDays(range.from, -1)
    const spanDays = Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1)
    const prevFrom = addDays(prevTo, -(spanDays - 1))
    return computeRangeRevenue(orders, prevFrom, prevTo).total
  }, [orders, range])
  const delta = summary.total - prevTotal
  const deltaPct = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : null

  // 라벨: 한 달 전체면 "N월 매출", 임의 기간이면 "2026.07.01 ~ 2026.07.15 기간 매출"
  const fm = fullMonthOf(range.from, range.to)
  const revenueLabel = fm != null ? `${fm}월 매출` : `${dot(range.from)} ~ ${dot(range.to)} 기간 매출`
  const deltaLabel = fm != null ? '전월 대비' : '직전 동일기간 대비'

  const cursor = useMemo(() => {
    const [y, m] = range.from.split('-').map(Number)
    const n = new Date()
    return { year: y || n.getFullYear(), month1: m || n.getMonth() + 1 }
  }, [range.from])

  function moveMonth(step: number) {
    const d = new Date(cursor.year, cursor.month1 - 1 + step, 1)
    setRange(monthBounds(d.getFullYear(), d.getMonth() + 1))
  }
  function goThisMonth() {
    const n = new Date()
    setRange(monthBounds(n.getFullYear(), n.getMonth() + 1))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">매출 관리</h2>
      </div>

      {/* [기간 필터] 정산 관리와 동일 — 진입 즉시 당월, 월 이동(연·월 동시) + 사용자 지정 기간 */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-3.5 shadow-soft ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <button type="button" onClick={() => moveMonth(-1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 sm:h-8 sm:w-8" title="이전 달">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-bold text-slate-800 sm:min-w-24 sm:text-center sm:text-sm sm:font-semibold">{cursor.year}년 {cursor.month1}월</span>
          <button type="button" onClick={() => moveMonth(1)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 sm:h-8 sm:w-8" title="다음 달">
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={goThisMonth} className="ml-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:px-2.5 sm:py-1.5 sm:text-xs">
            이번 달
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={range.from}
            max={range.to || undefined}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-slate-400">~</span>
          <input
            type="date"
            value={range.to}
            min={range.from || undefined}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">매출 계산 중…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      ) : (
        <>
          {/* 모바일: 매출 히어로 카드 + 가로 2칸 요약 */}
          <div className="space-y-3 md:hidden">
            <div className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">{revenueLabel}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <TrendingUp size={18} />
                </span>
              </div>
              <p className="mt-2 text-3xl font-extrabold leading-none text-slate-900">{won(summary.total)}</p>
              {deltaPct != null && (
                <p className={cn('mt-2 text-sm font-bold', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {deltaLabel} {delta >= 0 ? '▲' : '▼'} {won(Math.abs(delta))} ({deltaPct >= 0 ? '+' : ''}{deltaPct}%)
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 text-center shadow-soft ring-1 ring-slate-200/60">
                <p className="text-2xl font-extrabold text-slate-800">{summary.contractCount}건</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">매출 발생 계약</p>
              </div>
              <div className="rounded-2xl bg-white p-4 text-center shadow-soft ring-1 ring-slate-200/60">
                <p className="text-2xl font-extrabold text-slate-800">{summary.customerCount}곳</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">거래 고객사</p>
              </div>
            </div>
          </div>

          {/* 데스크톱: 3칸 요약 카드 */}
          <div className="hidden gap-4 md:grid md:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{revenueLabel}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <TrendingUp size={15} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{won(summary.total)}</p>
              {deltaPct != null && (
                <p className={cn('mt-1 text-xs font-medium', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {deltaLabel} {delta >= 0 ? '▲' : '▼'} {won(Math.abs(delta))} ({deltaPct >= 0 ? '+' : ''}{deltaPct}%)
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">매출 발생 계약</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                  <FileText size={15} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{summary.contractCount}건</p>
            </div>
            <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">거래 고객사</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Users size={15} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{summary.customerCount}곳</p>
            </div>
          </div>

          <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <PieChart size={15} className="text-slate-400" /> 고객별 매출 비중
              </h3>
              <span className="text-xs text-slate-400">{fm != null ? `${fm}월 기준` : `${dot(range.from)} ~ ${dot(range.to)}`}</span>
            </div>

            {summary.customers.length === 0 ? (
              <p className="py-14 text-center text-sm text-slate-400">이 기간에 발생한 보관 매출이 없습니다.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {summary.customers.map((c, i) => (
                  <li key={c.customerId}>
                    <div className="flex items-center justify-between gap-2 text-base">
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                        <span className="truncate">{c.customerName}</span>
                      </span>
                      <span className="shrink-0 tabular-nums font-bold text-slate-800">
                        {won(c.amount)} <span className="ml-1 text-xs font-medium text-slate-400">{pct(c.share)}</span>
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.max(c.share * 100, 2)}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
