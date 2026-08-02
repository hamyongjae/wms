import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  Loader2,
  Wallet,
  Coins,
  AlertTriangle,
  FileText,
  X,
  BadgeCheck,
  HandCoins,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { billingApi, type BillingLedger, type BillingStatus } from '@/api/billingApi'
import StatCard from '@/components/ui/StatCard'
import LedgerDetailPanel from '@/components/billing/LedgerDetailPanel'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { isOverdue, daysFromDue, displayStatus } from '@/lib/billing'
import { orderSync } from '@/lib/orderEvents'
import { today, ymdKorean } from '@/lib/dates'
import { CalendarField } from '@/components/order/orderFormUi'

/* '연체'는 저장 상태가 아니라 시점 해석 — 클라이언트 파생 필터로 제공한다 */
type FilterKey = 'ALL' | BillingStatus | 'OVERDUE'
// [간소화] '작성중(DRAFT)'·'이월(CARRIED_OVER)' 칩은 뺐다 — 생성=발행 통합 이후 새 정산서는 DRAFT가
//   될 수 없고, 이월 기능 자체를 없앴으므로 두 필터는 항상 0건만 뜨는 죽은 버튼이었다.
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'OVERDUE', label: '연체' },
  { key: 'ISSUED', label: '입금예정' }, // 목록 행 배지(displayStatus)와 같은 말을 쓴다 — '발행'은 회계 용어라 배지 문구와 안 맞았다
  { key: 'PARTIALLY_PAID', label: '부분수금' },
  { key: 'PAID', label: '완납' },
]

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const totalDue = (l: BillingLedger) => l.baseAmount + l.carriedOverIn + l.adjustmentTotal

/* [공용 셀 렌더] 테이블 셀과 모바일 카드가 동일 렌더를 공유(중복 제거) */
function LedgerReceivable({ l }: { l: BillingLedger }) {
  if (l.refundCompleted) return <span className="text-xs font-medium text-[#5C7C6B]">환불 완료</span>
  if (l.balance < 0) return <span className="text-emerald-600">환불 {won(l.refundDue ?? -l.balance)}</span>
  return <span className={l.balance > 0 ? 'text-slate-800' : 'text-slate-400'}>{won(l.outstanding ?? l.balance)}</span>
}

function LedgerDue({ l }: { l: BillingLedger }) {
  if (l.dueDate == null) return <span className="text-xs text-slate-400">—</span>
  const overdue = isOverdue(l)
  const d = daysFromDue(l.dueDate)
  const pending = l.balance > 0 && (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
  return (
    <span className={cn('text-xs', overdue ? 'font-semibold text-[#A65B44]' : 'text-slate-500')}>
      {l.dueDate}
      {pending && !overdue && d >= -7 && (
        <span className="ml-1.5 rounded bg-[#E9EEF3] px-1 py-0.5 text-[10px] font-semibold text-[#5A748F]">
          {d === 0 ? 'D-DAY' : `D${d}`}
        </span>
      )}
    </span>
  )
}

function LedgerStatusBadge({ l }: { l: BillingLedger }) {
  const ds = displayStatus(l)
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1', ds.cls)}>{ds.label}</span>
}

const pad2 = (n: number) => String(n).padStart(2, '0')
/** 해당 연·월(1~12)의 1일~말일 (yyyy-MM-dd) */
function monthBounds(year: number, month1: number): { from: string; to: string } {
  const last = new Date(year, month1, 0).getDate()
  return { from: `${year}-${pad2(month1)}-01`, to: `${year}-${pad2(month1)}-${pad2(last)}` }
}

export default function BillingPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [ledgers, setLedgers] = useState<BillingLedger[]>([])
  const [statusFilter, setStatusFilter] = useState<FilterKey>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
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
      if (Number.isFinite(id)) setSelectedId(id)
      setSearchParams({}, { replace: true }) // 한 번 소비 후 URL 정리
    }
  }, [searchParams, setSearchParams])

  // [딥링크] 대시보드 연체 알림에서 /billing?filter=OVERDUE 로 들어오면 연체 칩을 바로 켠다.
  //   기간이 이번 달로 좁혀져 있으면 지난달 이전에 밀린 연체 건이 안 보이므로 기간도 '전체'로 넓힌다.
  useEffect(() => {
    const f = searchParams.get('filter')
    if (f === 'OVERDUE') {
      setStatusFilter('OVERDUE')
      setRange({ from: '', to: '' })
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const reload = () => setRefreshKey((k) => k + 1)

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

  const kpi = useMemo(() => {
    const active = ledgers.filter((l) => l.status !== 'CANCELED')
    // [계정 과목 분리] 미수금은 양수 잔액(outstanding)만 합산 — 음수(과오납)가 미수금을 갉아먹지 않도록.
    const outstanding = active.reduce((s, l) => s + (l.outstanding ?? Math.max(l.balance, 0)), 0)
    const refundDue = active.reduce((s, l) => s + (l.refundDue ?? Math.max(-l.balance, 0)), 0)
    const collected = active.reduce((s, l) => s + l.paidTotal, 0)
    const overdueCount = ledgers.filter(isOverdue).length
    return { outstanding, refundDue, collected, overdueCount, count: ledgers.length }
  }, [ledgers])

  const visible = useMemo(() => {
    if (statusFilter === 'ALL') return ledgers
    if (statusFilter === 'OVERDUE') return ledgers.filter(isOverdue) // 파생 필터
    return ledgers.filter((l) => l.status === statusFilter)
  }, [ledgers, statusFilter])

  // [원터치] 전액 수금 처리 — 계좌이체·오늘 날짜로 잔액 전액을 즉시 수금 기록
  async function handleQuickCollect(l: BillingLedger) {
    const amt = l.outstanding ?? l.balance
    if (!window.confirm(`${l.customerName} · ${won(amt)}을 전액 수금(계좌이체)으로 처리할까요?`)) return
    try {
      await billingApi.recordPayment(l.id, { amount: amt, method: 'BANK_TRANSFER', paidOn: today() })
      setNotice(`${l.customerName} ${won(amt)} 수금 완료`)
      reload()
      orderSync.emit() // 대시보드·매출 실시간 갱신
    } catch (err) {
      setNotice(errMsg(err, '수금 처리에 실패했습니다.'))
    }
  }

  // [원터치] 환불 완료 처리
  async function handleQuickRefund(l: BillingLedger) {
    if (!window.confirm(`${l.customerName} 환불 완료로 처리할까요?`)) return
    try {
      await billingApi.completeRefund(l.id)
      setNotice(`${l.customerName} 환불 완료`)
      reload()
      orderSync.emit()
    } catch (err) {
      setNotice(errMsg(err, '환불 완료 처리에 실패했습니다.'))
    }
  }

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
        <h2 className="text-xl font-bold text-slate-800">정산 관리</h2>
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
        <BillStat label="누적 수금액" value={won(kpi.collected)} tone="emerald" />
        <BillStat label="정산 건수" value={`${kpi.count}건`} tone="slate" />
        <BillStat label="미수금 총액" value={won(kpi.outstanding)} tone="amber" alert={kpi.outstanding > 0} />
        <BillStat label="연체 건수" value={`${kpi.overdueCount}건`} tone="red" alert={kpi.overdueCount > 0} />
      </div>
      {/* 데스크톱: StatCard */}
      <div className="hidden gap-4 md:grid md:grid-cols-4">
        <StatCard label="누적 수금액" value={won(kpi.collected)} icon={Coins} tone="emerald" />
        <StatCard label="정산 건수" value={`${kpi.count}건`} icon={FileText} tone="slate" />
        <StatCard
          label="미수금 총액"
          value={won(kpi.outstanding)}
          sub={kpi.refundDue > 0 ? `환불 대상 ${won(kpi.refundDue)}` : undefined}
          icon={Wallet}
          tone="amber"
        />
        <StatCard label="연체 건수" value={`${kpi.overdueCount}건`} icon={AlertTriangle} tone="indigo" />
      </div>

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

      {/* ===== 데스크톱: 테이블 (md 이상) ===== */}
      {!loading && !error && visible.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">고객</th>
                <th className="px-5 py-3 font-medium">보관기간</th>
                <th className="px-5 py-3 text-right font-medium">보관료</th>
                <th className="px-5 py-3 text-right font-medium">미수금</th>
                <th className="px-5 py-3 font-medium">납기</th>
                <th className="px-5 py-3 font-medium">상태</th>
                <th className="px-5 py-3 font-medium">세금계산서</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((l) => (
                <tr key={l.id} onClick={() => setSelectedId(l.id)} className="cursor-pointer transition hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-600">{l.customerName}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {l.periodStart} ~ {l.periodEnd}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700">{won(totalDue(l))}</td>
                  <td className="px-5 py-3 text-right font-medium">
                    <LedgerReceivable l={l} />
                  </td>
                  <td className="px-5 py-3">
                    <LedgerDue l={l} />
                  </td>
                  <td className="px-5 py-3">
                    <LedgerStatusBadge l={l} />
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs text-slate-600">{l.taxInvoiceIssued ? '발행' : '미발행'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 모바일: 정산 내역 카드 (md 미만) — 탭하면 상세, 카드 내 원터치 처리 ===== */}
      {!loading && !error && visible.length > 0 && (
        <div className="space-y-2 md:hidden">
          {visible.map((l) => {
            const overdue = isOverdue(l)
            const outstanding = l.outstanding ?? Math.max(l.balance, 0)
            const refundDue = l.refundDue ?? Math.max(-l.balance, 0)
            const canCollect = l.balance > 0 && (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
            const canRefund = refundDue > 0 && !l.refundCompleted
            const dueLabel = l.refundCompleted ? '환불' : refundDue > 0 ? '환불 대상' : '미수금'
            const dueValueCls = l.refundCompleted
              ? 'text-slate-400'
              : refundDue > 0
                ? 'text-emerald-600'
                : overdue
                  ? 'text-red-600'
                  : outstanding > 0
                    ? 'text-slate-900'
                    : 'text-slate-400'
            return (
              <div key={l.id} className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60">
                <button type="button" onClick={() => setSelectedId(l.id)} className="w-full p-3.5 text-left transition active:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-lg font-bold text-slate-800">{l.customerName}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <LedgerStatusBadge l={l} />
                      <ChevronRight size={20} className="text-slate-300" />
                    </div>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{l.periodStart} ~ {l.periodEnd}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-400">보관료</p>
                      <p className="mt-0.5 text-base font-semibold text-slate-700">{won(totalDue(l))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-slate-400">{dueLabel}</p>
                      <p className={cn('mt-0.5 text-2xl font-extrabold leading-none', dueValueCls)}>
                        {l.refundCompleted ? '완료' : won(refundDue > 0 ? refundDue : outstanding)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-slate-400">납기</span>
                    <LedgerDue l={l} />
                    <span className="ml-auto text-slate-400">세금계산서 {l.taxInvoiceIssued ? '발행' : '미발행'}</span>
                  </div>
                </button>

                {/* 원터치 처리 버튼 */}
                {(canCollect || (canRefund && isAdmin)) && (
                  <div className="space-y-1.5 border-t border-slate-100 p-2">
                    {canCollect && (
                      <button
                        type="button"
                        onClick={() => handleQuickCollect(l)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-base font-bold text-white transition active:scale-[0.99]"
                      >
                        <HandCoins size={18} /> 전액 수금 · {won(outstanding)}
                      </button>
                    )}
                    {canRefund && isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleQuickRefund(l)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-base font-bold text-white transition active:scale-[0.99]"
                      >
                        <BadgeCheck size={18} /> 환불 완료
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedId != null && (
        <LedgerDetailPanel
          ledgerId={selectedId}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            reload()
          }}
        />
      )}
    </div>
  )
}

/* ===== 소품 ===== */
/* 모바일 가로형 요약 카드 — 큰 숫자 + 경고 색상 */
function BillStat({ label, value, tone, alert }: { label: string; value: string; tone: 'emerald' | 'slate' | 'amber' | 'red'; alert?: boolean }) {
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
    </div>
  )
}

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}
