import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, TrendingUp, FileText, Users, Loader2, PieChart } from 'lucide-react'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { computeMonthlyRevenue } from '@/lib/revenue'
import { orderSync } from '@/lib/orderEvents'
import { cn } from '@/lib/cn'

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const pct = (r: number) => `${Math.round(r * 100)}%`

// 고객사별 비중 바 색상 — 상위부터 채도 있는 인디고 계열, 이후 뮤티드 톤 순환
const BAR_COLORS = ['#6366f1', '#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#94a3b8']

export default function RevenuePage() {
  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month1: now.getMonth() + 1 })

  // 진입 즉시 자동 로드 (조회 버튼 없음)
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

  // 계약에서 파생 계산 — 커서(월)나 계약이 바뀌면 자동 재계산
  const summary = useMemo(
    () => computeMonthlyRevenue(orders, cursor.year, cursor.month1),
    [orders, cursor],
  )

  // 직전 달 대비 증감 (같은 계약 기준 파생)
  const prevTotal = useMemo(() => {
    const d = new Date(cursor.year, cursor.month1 - 2, 1)
    return computeMonthlyRevenue(orders, d.getFullYear(), d.getMonth() + 1).total
  }, [orders, cursor])
  const delta = summary.total - prevTotal
  const deltaPct = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : null

  function moveMonth(step: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month1 - 1 + step, 1)
      return { year: d.getFullYear(), month1: d.getMonth() + 1 }
    })
  }
  const isThisMonth = cursor.year === now.getFullYear() && cursor.month1 === now.getMonth() + 1

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">매출 관리</h2>
          <p className="mt-1 text-sm text-slate-500">계약 점유 기간에 따라 자동 누적되는 보관 매출을 한 화면에서 확인합니다.</p>
        </div>
        {/* 월 이동 — 단일 뷰 안에서 조회 버튼 없이 즉시 전환 */}
        <div className="flex items-center gap-2">
          <span className="min-w-28 text-center text-sm font-semibold text-slate-700">
            {cursor.year}년 {cursor.month1}월
          </span>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white">
            <button type="button" onClick={() => moveMonth(-1)} className="p-1.5 text-slate-500 hover:text-slate-800" title="이전 달">
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setCursor({ year: now.getFullYear(), month1: now.getMonth() + 1 })}
              className="border-x border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              이번 달
            </button>
            <button type="button" onClick={() => moveMonth(1)} className="p-1.5 text-slate-500 hover:text-slate-800" title="다음 달">
              <ChevronRight size={16} />
            </button>
          </div>
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
          {/* 요약 카드 */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{isThisMonth ? '이번 달' : `${cursor.month1}월`} 매출</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <TrendingUp size={15} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{won(summary.total)}</p>
              {deltaPct != null && (
                <p className={cn('mt-1 text-xs font-medium', delta >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  전월 대비 {delta >= 0 ? '▲' : '▼'} {won(Math.abs(delta))} ({deltaPct >= 0 ? '+' : ''}{deltaPct}%)
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

          {/* 고객사별 매출 비중 */}
          <section className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <PieChart size={15} className="text-slate-400" /> 고객별 매출 비중
              </h3>
              <span className="text-xs text-slate-400">{cursor.month1}월 기준</span>
            </div>

            {summary.customers.length === 0 ? (
              <p className="py-14 text-center text-sm text-slate-400">이 달에 발생한 보관 매출이 없습니다.</p>
            ) : (
              <ul className="mt-5 space-y-4">
                {summary.customers.map((c, i) => (
                  <li key={c.customerId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                        {c.customerName}
                      </span>
                      <span className="tabular-nums text-slate-600">
                        {won(c.amount)} <span className="ml-1 text-xs text-slate-400">{pct(c.share)}</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
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
