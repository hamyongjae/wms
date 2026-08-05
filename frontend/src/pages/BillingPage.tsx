import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Loader2,
  Wallet,
  Coins,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  PieChart,
} from 'lucide-react'
import { billingApi, type BillingLedger, type BillingStatus } from '@/api/billingApi'
import StatCard from '@/components/ui/StatCard'
import LedgerRow from '@/components/billing/LedgerRow'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { isOverdue, accruedPaidInRange } from '@/lib/billing'
import { computeRangeRevenue } from '@/lib/revenue'
import { orderSync } from '@/lib/orderEvents'
import { ymdKorean, addDays } from '@/lib/dates'
import { CalendarField } from '@/components/order/orderFormUi'

/* '연체'는 저장 상태가 아니라 시점 해석 — 클라이언트 파생 필터로 제공한다 */
type FilterKey = 'ALL' | BillingStatus | 'OVERDUE'
// [간소화] '작성중(DRAFT)'·'이월(CARRIED_OVER)' 칩은 뺐다 — 생성=발행 통합 이후 새 정산서는 DRAFT가
//   될 수 없고, 이월 기능 자체를 없앴으므로 두 필터는 항상 0건만 뜨는 죽은 버튼이었다.
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'OVERDUE', label: '연체' },
  { key: 'ISSUED', label: '입금예정' }, // 목록 행 배지(displayStatus)와 같은 말을 쓴다 — '발행'은 회계 용어라 배지 문구와 안 맞았다
  { key: 'PARTIALLY_PAID', label: '부분입금' },
  { key: 'PAID', label: '완납' },
]

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const pct = (r: number) => `${Math.round(r * 100)}%`

// 고객사별 입금 비중 바 색상 (구 매출관리 화면에서 이식)
const BAR_COLORS = ['#6366f1', '#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#94a3b8']

/** [from, to]가 어떤 달의 1일~말일과 정확히 일치하면 그 달(1~12), 아니면 null */
function fullMonthOf(from: string, to: string): number | null {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  if (fd !== 1 || fy !== ty || fm !== tm) return null
  return td === new Date(fy, fm, 0).getDate() ? fm : null
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** 해당 연·월(1~12)의 1일~말일 (yyyy-MM-dd) */
function monthBounds(year: number, month1: number): { from: string; to: string } {
  const last = new Date(year, month1, 0).getDate()
  return { from: `${year}-${pad2(month1)}-01`, to: `${year}-${pad2(month1)}-${pad2(last)}` }
}

/** [연체 딥링크용 '전체' 대체] 날짜 입력칸이 비어 보이지 않도록, 충분히 넓은 실제 기간을 준다. */
function wideRange(): { from: string; to: string } {
  const y = new Date().getFullYear()
  return { from: `${y - 10}-01-01`, to: `${y + 1}-12-31` }
}

export default function BillingPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [ledgers, setLedgers] = useState<BillingLedger[]>([])
  // [구 매출관리 통합] 목록·KPI용 ledgers는 기간 스코프 조회를 유지하고, 고객별 입금 비중과
  // 전월 대비 비교는 직전 기간까지 걸치므로 별도로 전체를 조회해 클라이언트에서 계산한다.
  const [revenueLedgers, setRevenueLedgers] = useState<BillingLedger[]>([])
  // [스크롤 절약] 고객별 입금 비중은 부가 정보라 기본 접힘 — 헤더 탭으로 펼친다
  const [revenueOpen, setRevenueOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<FilterKey>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // [제로 클릭] 진입 즉시 '당월 1일~말일'을 기본 조회 기간으로 세팅
  const [range, setRange] = useState(() => {
    const n = new Date()
    return monthBounds(n.getFullYear(), n.getMonth() + 1)
  })
  // [딥링크] 캘린더 등에서 /billing?ledger=ID 로 진입하면 해당 원장 상세를 바로 연다
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const raw = searchParams.get('ledger')
    if (raw != null) {
      const id = Number(raw)
      if (Number.isFinite(id)) setExpandedId(id)
      setSearchParams({}, { replace: true }) // 한 번 소비 후 URL 정리
    }
  }, [searchParams, setSearchParams])

  // [딥링크] 대시보드 연체 알림에서 /billing?filter=OVERDUE 로 들어오면 연체 칩을 바로 켠다.
  //   기간이 이번 달로 좁혀져 있으면 지난달 이전에 밀린 연체 건이 안 보이므로 기간도 넓힌다.
  //   빈 문자열('전체')로 두면 날짜 입력칸이 비어 보이고 고객별 입금 비중 계산도 깨지므로
  //   (조회기간이 없으면 일할 계산 기준점이 없어 0건으로 나옴) 충분히 넓은 실제 날짜로 대신한다.
  useEffect(() => {
    const f = searchParams.get('filter')
    if (f === 'OVERDUE') {
      setStatusFilter('OVERDUE')
      setRange(wideRange())
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const reload = () => setRefreshKey((k) => k + 1)

  // [실시간 동기화] 계약 수정·삭제·상태전환 등 외부 변경이 생기면 목록·매출 섹션 모두 재조회
  //   (구 매출관리 화면에 있던 구독 — 정산 관리엔 없었던 부수 개선)
  useEffect(() => orderSync.subscribe(() => setRefreshKey((k) => k + 1)), [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    // 기간(range)이나 새로고침 키가 바뀌면 해당 기간 원장만 서버에서 받아 카드·표를 함께 갱신
    billingApi
      .list(range.from && range.to ? range : undefined)
      .then(setLedgers)
      .catch(() => setError('정산서를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [refreshKey, range])

  // [구 매출관리 통합] 고객별 입금 비중 · 전월 대비는 조회 기간 밖(직전 기간)도 봐야 하므로
  //   기간 스코프 없이 전체를 따로 받아 클라이언트에서 계산한다(구 매출관리 화면과 동일 패턴).
  useEffect(() => {
    billingApi.list().then(setRevenueLedgers).catch(() => {})
  }, [refreshKey])

  const kpi = useMemo(() => {
    const active = ledgers.filter((l) => l.status !== 'CANCELED')
    // [계정 과목 분리] 미수금은 양수 잔액(outstanding)만 합산 — 음수(과오납)가 미수금을 갉아먹지 않도록.
    const outstanding = active.reduce((s, l) => s + (l.outstanding ?? Math.max(l.balance, 0)), 0)
    const refundDue = active.reduce((s, l) => s + (l.refundDue ?? Math.max(-l.balance, 0)), 0)
    // [조회기간 일할 입금액] 기간이 지정돼 있으면(전체 조회가 아니면) 원장 청구기간과 겹친
    // 일수만큼만 입금액을 잘라 인식 — '전체'(무기한) 조회는 자를 기준이 없으므로 누적 그대로.
    const collected =
      range.from && range.to
        ? active.reduce((s, l) => s + accruedPaidInRange(l, range.from, range.to), 0)
        : active.reduce((s, l) => s + l.paidTotal, 0)
    const overdueCount = ledgers.filter(isOverdue).length
    return { outstanding, refundDue, collected, overdueCount, count: ledgers.length }
  }, [ledgers, range])

  // [구 매출관리 통합] 고객별 입금 비중 — 조회 기간 안에서 발생한 입금을 고객별로 묶는다.
  const revenueSummary = useMemo(
    () =>
      range.from && range.to
        ? computeRangeRevenue(revenueLedgers, range.from, range.to)
        : computeRangeRevenue(revenueLedgers, range.from, range.from),
    [revenueLedgers, range],
  )
  // [구 매출관리 통합] 직전 '동일 길이' 기간 대비 증감 — "기간 입금액" 카드의 sub 줄에 사용.
  const prevTotal = useMemo(() => {
    if (!range.from || !range.to) return 0
    const prevTo = addDays(range.from, -1)
    const spanDays = Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1)
    const prevFrom = addDays(prevTo, -(spanDays - 1))
    return computeRangeRevenue(revenueLedgers, prevFrom, prevTo).total
  }, [revenueLedgers, range])
  const delta = kpi.collected - prevTotal
  const deltaPct = prevTotal > 0 ? Math.round((delta / prevTotal) * 100) : null
  const deltaLabel = fullMonthOf(range.from, range.to) != null ? '전월 대비' : '직전 동일기간 대비'

  const visible = useMemo(() => {
    if (statusFilter === 'ALL') return ledgers
    if (statusFilter === 'OVERDUE') return ledgers.filter(isOverdue) // 파생 필터
    return ledgers.filter((l) => l.status === statusFilter)
  }, [ledgers, statusFilter])

  // 현재 조회 기간의 기준 연·월 (from 기준)
  const cursor = useMemo(() => {
    const [y, m] = range.from.split('-').map(Number)
    return { year: y || new Date().getFullYear(), month1: m || new Date().getMonth() + 1 }
  }, [range.from])

  // 월 단위 이동 — 해당 월의 1일~말일로 기간을 통째로 세팅 (연·월 동시 전환)
  function moveMonth(step: number) {
    const d = new Date(cursor.year, cursor.month1 - 1 + step, 1)
    setRange(monthBounds(d.getFullYear(), d.getMonth() + 1))
  }
  function goThisMonth() {
    const n = new Date()
    setRange(monthBounds(n.getFullYear(), n.getMonth() + 1))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold text-slate-800">매출 관리</h2>
      </div>

      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-indigo-400 hover:text-indigo-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* [기간 필터] 진입 즉시 당월. 월 이동(연·월 동시) + 사용자 지정 기간 — 변경 시 카드·표 동시 갱신 */}
      <div className="flex flex-col gap-2 rounded-2xl bg-white p-2.5 shadow-soft ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <button type="button" onClick={() => moveMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:h-8 md:w-8" title="이전 달">
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-28 text-center text-base font-bold text-slate-800 md:min-w-24 md:text-sm md:font-semibold">{cursor.year}년 {cursor.month1}월</span>
          <button type="button" onClick={() => moveMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:h-8 md:w-8" title="다음 달">
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={goThisMonth} className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 md:px-2.5 md:py-1.5 md:text-xs md:font-medium">
            이번 달
          </button>
        </div>
        <div className="flex flex-1 items-center gap-2 text-sm sm:flex-none">
          <CalendarField
            value={range.from}
            onChange={(v) => setRange((r) => ({ ...r, from: v }))}
            max={range.to || undefined}
            format={ymdKorean}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-36 sm:flex-none"
          />
          <span className="shrink-0 text-slate-400">~</span>
          <CalendarField
            value={range.to}
            onChange={(v) => setRange((r) => ({ ...r, to: v }))}
            min={range.from || undefined}
            format={ymdKorean}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-36 sm:flex-none"
          />
        </div>
      </div>

      {/* 모바일: 가로형 요약 2×2 (큰 숫자·경고 색상) */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <BillStat
          label="기간 입금액"
          value={won(kpi.collected)}
          tone="emerald"
          sub={deltaPct != null ? `${deltaLabel} ${delta >= 0 ? '▲' : '▼'} ${deltaPct >= 0 ? '+' : ''}${deltaPct}%` : undefined}
          subClassName={delta >= 0 ? 'text-emerald-600' : 'text-red-500'}
        />
        <BillStat label="미수금 총액" value={won(kpi.outstanding)} tone="amber" alert={kpi.outstanding > 0} />
      </div>
      {/* 데스크톱: StatCard */}
      <div className="hidden gap-4 md:grid md:grid-cols-2">
        <StatCard
          label="기간 입금액"
          value={won(kpi.collected)}
          sub={deltaPct != null ? `${deltaLabel} ${delta >= 0 ? '▲' : '▼'} ${won(Math.abs(delta))} (${deltaPct >= 0 ? '+' : ''}${deltaPct}%)` : undefined}
          subClassName={delta >= 0 ? 'text-emerald-600' : 'text-red-500'}
          icon={Coins}
          tone="emerald"
        />
        <StatCard
          label="미수금 총액"
          value={won(kpi.outstanding)}
          sub={kpi.refundDue > 0 ? `환불 대상 ${won(kpi.refundDue)}` : undefined}
          icon={Wallet}
          tone="amber"
        />
      </div>

      {/* [구 매출관리 통합] 고객별 입금 비중 랭킹 — 기본 접힘(부가 정보라 목록까지 스크롤이
          길어지지 않도록), 헤더를 탭하면 펼쳐진다 */}
      <section className="rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60">
        <button
          type="button"
          onClick={() => setRevenueOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 p-4 text-left md:p-6"
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <PieChart size={15} className="text-slate-400" /> 고객별 입금 비중
          </h3>
          <span className="flex items-center gap-2 text-xs text-slate-400">
            {revenueSummary.customerCount}개 고객사 · {revenueSummary.contractCount}건 계약
            {revenueOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </button>

        {revenueOpen && (
          <div className="px-4 pb-4 md:px-6 md:pb-6">
            {revenueSummary.customers.length === 0 ? (
              <p className="py-14 text-center text-sm text-slate-400">이 기간에 발생한 입금이 없습니다.</p>
            ) : (
              <ul className="space-y-3">
                {revenueSummary.customers.map((c, i) => (
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
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const count =
            f.key === 'ALL'
              ? ledgers.length
              : f.key === 'OVERDUE'
                ? ledgers.filter(isOverdue).length
                : ledgers.filter((l) => l.status === f.key).length
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                statusFilter === f.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.label} <span className="ml-0.5 opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-10 text-center">
          <p className="text-base font-semibold text-slate-700">정산서가 없습니다</p>
          <p className="mt-1 text-sm text-slate-400">계약이 등록되면 스케줄러가 자동으로 정산서를 생성합니다.</p>
        </div>
      )}

      {/* [계약관리와 동일 템플릿] 화면 크기와 무관하게 회차 카드 하나로 통일 — 탭하면
          그 자리에서 정산 시작일·종료일·입금액·정산금액을 바로 고칠 수 있다. 입금 기록·
          조정·납기일변경·환불처리·이력조회는 이 화면에서 다루지 않는다(계약관리 정산
          이력에도 원래 없는 기능들이다). */}
      {!loading && !error && visible.length > 0 && (
        <ol className="space-y-2">
          {visible.map((l) => (
            <LedgerRow
              key={l.id}
              ledger={l}
              label={l.customerName}
              isAdmin={isAdmin}
              expanded={expandedId === l.id}
              onToggle={() => setExpandedId((cur) => (cur === l.id ? null : l.id))}
              onCollapse={() => setExpandedId(null)}
              onChanged={() => reload()}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

/* ===== 소품 ===== */
/* 모바일 가로형 요약 카드 — 큰 숫자 + 경고 색상 */
function BillStat({
  label,
  value,
  tone,
  alert,
  sub,
  subClassName,
}: {
  label: string
  value: string
  tone: 'emerald' | 'slate' | 'amber' | 'red'
  alert?: boolean
  sub?: string
  subClassName?: string
}) {
  const numCls =
    tone === 'emerald'
      ? 'text-emerald-600'
      : tone === 'amber'
        ? alert ? 'text-amber-600' : 'text-slate-800'
        : tone === 'red'
          ? alert ? 'text-red-600' : 'text-slate-400'
          : 'text-slate-800'
  return (
    <div className="rounded-2xl bg-white p-2.5 shadow-soft ring-1 ring-slate-200/60">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={cn('mt-0.5 text-xl font-extrabold leading-tight', numCls)}>{value}</p>
      {sub && <p className={cn('mt-0.5 text-[11px] font-semibold', subClassName ?? 'text-slate-400')}>{sub}</p>}
    </div>
  )
}

