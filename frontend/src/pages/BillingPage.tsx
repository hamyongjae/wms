import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
  SlidersHorizontal,
  ArrowRightCircle,
  Undo2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  billingApi,
  type BillingLedger,
  type BillingStatus,
  type LedgerDetail,
  type PaymentMethod,
  type AdjustmentType,
} from '@/api/billingApi'
import StatCard from '@/components/ui/StatCard'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { isOverdue, daysFromDue, displayStatus } from '@/lib/billing'
import { orderSync } from '@/lib/orderEvents'
import { today } from '@/lib/dates'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

/* [뮤티드 상태색] 채도를 눌러 익힌 톤 — 경고조차 품위 있게 (마스터플랜 2.1) */
const STATUS_META: Record<BillingStatus, { label: string; cls: string }> = {
  DRAFT: { label: '작성중', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  ISSUED: { label: '발행', cls: 'bg-[#E9EEF3] text-[#5A748F] ring-[#D4DDE7]' },
  PARTIALLY_PAID: { label: '부분수금', cls: 'bg-[#EFEBE4] text-[#8A8172] ring-[#E2DCD1]' },
  PAID: { label: '완납', cls: 'bg-[#E9EFEA] text-[#5C7C6B] ring-[#D3DFD6]' },
  CARRIED_OVER: { label: '이월마감', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  CANCELED: { label: '취소', cls: 'bg-slate-100 text-slate-400 ring-slate-200' },
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  BANK_TRANSFER: '계좌이체',
  CASH: '현금',
  CARD: '카드',
  OTHER: '기타',
}

const ADJ_LABEL: Record<AdjustmentType, string> = {
  DISCOUNT: '할인',
  SURCHARGE: '가산',
  WRITE_OFF: '대손상각',
  CORRECTION: '정정',
}

/* '연체'는 저장 상태가 아니라 시점 해석 — 클라이언트 파생 필터로 제공한다 */
type FilterKey = 'ALL' | BillingStatus | 'OVERDUE'
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'OVERDUE', label: '연체' },
  { key: 'ISSUED', label: '발행' },
  { key: 'PARTIALLY_PAID', label: '부분수금' },
  { key: 'PAID', label: '완납' },
  { key: 'DRAFT', label: '작성중' },
  { key: 'CARRIED_OVER', label: '이월' },
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

  const reload = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    setLoading(true)
    setError(null)
    // 기간(range)이나 새로고침 키가 바뀌면 해당 기간 원장만 서버에서 받아 카드·표를 함께 갱신
    billingApi
      .list(range.from && range.to ? range : undefined)
      .then(setLedgers)
      .catch(() => setError('청구 원장을 불러오지 못했습니다.'))
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
        <div>
          <h2 className="text-xl font-bold text-slate-800">정산 관리</h2>
          <p className="mt-0.5 text-sm text-slate-500">보관료 청구 원장과 수금·조정·미수금 이월을 관리합니다.</p>
        </div>
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
          <p className="text-base font-semibold text-slate-700">청구 원장이 없습니다</p>
          <p className="mt-1 text-sm text-slate-400">계약이 등록되면 스케줄러가 자동으로 원장을 생성합니다.</p>
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

/* ===== 상세 패널 (수금·조정 이력 + 액션) ===== */
function LedgerDetailPanel({
  ledgerId,
  isAdmin,
  onClose,
  onChanged,
}: {
  ledgerId: number
  isAdmin: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<LedgerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'pay' | 'adjust' | 'carry' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    billingApi
      .detail(ledgerId)
      .then(setDetail)
      .catch(() => setActionError('상세를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [ledgerId, reloadKey])

  function afterAction() {
    setMode(null)
    setActionError(null)
    setReloadKey((k) => k + 1) // 패널 내 상세 갱신
    onChanged() // 목록 갱신
    orderSync.emit() // [실시간 동기화] 대시보드 차트·매출 화면이 새로고침 없이 최신 집계로 갱신
  }

  const l = detail?.ledger
  const canIssue = l?.status === 'DRAFT'
  const canPay = l != null && l.balance > 0 && (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
  const canAdjust = l != null && (l.status === 'DRAFT' || l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
  const canCarry = l != null && l.balance > 0 && (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
  // [환불 완료] 환불 대상 금액이 있고 아직 미완료일 때만 (이중 방어 — 백엔드에서도 재검증)
  const canRefund = l != null && (l.refundDue ?? Math.max(-l.balance, 0)) > 0 && !l.refundCompleted

  async function handleIssue() {
    try {
      await billingApi.issue(ledgerId)
      afterAction()
    } catch (err) {
      setActionError(errMsg(err, '발행에 실패했습니다.'))
    }
  }

  async function handleCompleteRefund() {
    if (!window.confirm('환불 완료 처리하시겠습니까?\n환불 대상 금액을 지급 완료로 마감하고 잔액을 0원으로 정리합니다.')) return
    try {
      await billingApi.completeRefund(ledgerId)
      afterAction() // 상세·목록 비동기 재조회 (전체 새로고침 없음)
    } catch (err) {
      setActionError(errMsg(err, '환불 완료 처리에 실패했습니다.'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{l?.customerName ?? '청구 원장'} 정산서 </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {loading || !l ? (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
            <Loader2 className="animate-spin" size={18} />
            <span className="text-sm">불러오는 중…</span>
          </div>
        ) : (
          <div className="space-y-6 px-6 py-5">
            {/* 요약 */}
            <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                      STATUS_META[l.status].cls,
                    )}
                  >
                    {STATUS_META[l.status].label}
                  </span>
                  {l.refundCompleted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E9EFEA] px-2 py-0.5 text-xs font-medium text-[#5C7C6B] ring-1 ring-[#D3DFD6]">
                      <BadgeCheck size={12} /> 환불 완료
                    </span>
                  ) : (l.refundDue ?? Math.max(-l.balance, 0)) > 0 ? (
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                      환불 대기
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-slate-400">
                  {l.billingType === 'MONTHLY' ? '월 단위' : '일 단위'} ·{' '}
                  {l.settlementType === 'PREPAID' ? '선납' : '후납'}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <Info label="청구기간">
                  {l.periodStart} ~ {l.periodEnd}
                </Info>
                <Info label="납기">{l.dueDate ?? '—'}</Info>
                <Info label="기본 청구액">{won(l.baseAmount)}</Info>
                <Info label="이월 유입">{won(l.carriedOverIn)}</Info>
                <Info label="조정 합계">{won(l.adjustmentTotal)}</Info>
                <Info label="수금 합계">{won(l.paidTotal)}</Info>
              </dl>
              <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-sm text-slate-500">{l.balance < 0 ? '환불 대상 금액' : '미수금 잔액'}</span>
                <span
                  className={cn(
                    'text-lg font-bold',
                    l.balance < 0 ? 'text-emerald-600' : l.balance > 0 ? 'text-slate-900' : 'text-slate-400',
                  )}
                >
                  {won(l.balance < 0 ? (l.refundDue ?? -l.balance) : (l.outstanding ?? l.balance))}
                </span>
              </div>
              {l.balance < 0 && !l.refundCompleted && (
                <p className="mt-1 text-right text-[11px] text-emerald-600">
                  중도출고로 실청구액이 수금액보다 작아 환불(선급금 반환) 대상입니다.
                </p>
              )}
              {l.refundCompleted && l.refundedAt && (
                <p className="mt-1 text-right text-[11px] text-slate-400">
                  {l.refundedAt.slice(0, 10)} 환불 지급 완료 · 정산 마감
                </p>
              )}
            </section>

            {/* 액션 버튼 */}
            <div className="flex flex-wrap gap-2">
              {canIssue && isAdmin && (
                <ActionBtn onClick={handleIssue} icon={<BadgeCheck size={15} />} tone="indigo">
                  발행
                </ActionBtn>
              )}
              {canPay && (
                <ActionBtn onClick={() => setMode(mode === 'pay' ? null : 'pay')} icon={<HandCoins size={15} />} tone="emerald">
                  수금 기록
                </ActionBtn>
              )}
              {canAdjust && isAdmin && (
                <ActionBtn
                  onClick={() => setMode(mode === 'adjust' ? null : 'adjust')}
                  icon={<SlidersHorizontal size={15} />}
                  tone="amber"
                >
                  조정
                </ActionBtn>
              )}
              {canCarry && isAdmin && (
                <ActionBtn onClick={() => setMode(mode === 'carry' ? null : 'carry')} icon={<ArrowRightCircle size={15} />} tone="violet">
                  미수금 이월
                </ActionBtn>
              )}
              {canRefund && isAdmin && (
                <ActionBtn onClick={handleCompleteRefund} icon={<BadgeCheck size={15} />} tone="emerald">
                  환불 완료
                </ActionBtn>
              )}
            </div>

            {actionError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>
            )}

            {mode === 'pay' && (
              <PaymentForm
                ledgerId={ledgerId}
                defaultAmount={l.balance}
                onDone={afterAction}
                onError={setActionError}
              />
            )}
            {mode === 'adjust' && (
              <AdjustmentForm ledgerId={ledgerId} onDone={afterAction} onError={setActionError} />
            )}
            {mode === 'carry' && (
              <CarryOverForm ledgerId={ledgerId} onDone={afterAction} onError={setActionError} />
            )}

            {/* 수금 이력 */}
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">수금 이력</h4>
              {detail!.payments.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">수금 내역 없음</p>
              ) : (
                <ul className="space-y-2">
                  {detail!.payments.map((p) => (
                    <li
                      key={p.id}
                      className={cn(
                        'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
                        p.reversed ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white',
                      )}
                    >
                      <div>
                        <span className={cn('font-medium', p.reversed && 'line-through')}>{won(p.amount)}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {METHOD_LABEL[p.method]} · {p.paidOn}
                        </span>
                        {p.reversed && <span className="ml-2 text-xs text-red-500">취소됨</span>}
                      </div>
                      {isAdmin && !p.reversed && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('이 수금 건을 취소(잔액 원복)할까요?')) return
                            try {
                              await billingApi.reversePayment(p.id)
                              afterAction()
                            } catch (err) {
                              setActionError(errMsg(err, '수금 취소에 실패했습니다.'))
                            }
                          }}
                          className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-red-600"
                        >
                          <Undo2 size={13} />
                          취소
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 조정 이력 */}
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">조정 이력</h4>
              {detail!.adjustments.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">조정 내역 없음</p>
              ) : (
                <ul className="space-y-2">
                  {detail!.adjustments.map((a) => (
                    <li key={a.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">{ADJ_LABEL[a.type]}</span>
                        <span className={cn('font-medium', a.amount < 0 ? 'text-red-600' : 'text-emerald-600')}>
                          {a.amount > 0 ? '+' : ''}
                          {won(a.amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{a.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

/* ===== 수금 폼 ===== */
function PaymentForm({
  ledgerId,
  defaultAmount,
  onDone,
  onError,
}: {
  ledgerId: number
  defaultAmount: number
  onDone: () => void
  onError: (m: string) => void
}) {
  const [amount, setAmount] = useState(String(Math.round(defaultAmount)))
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [paidOn, setPaidOn] = useState(today())
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await billingApi.recordPayment(ledgerId, {
        amount: Number(amount),
        method,
        paidOn,
        memo: memo || undefined,
      })
      onDone()
    } catch (err) {
      onError(errMsg(err, '수금 기록에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <p className="text-sm font-semibold text-emerald-800">수금 기록</p>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="수금액(원)">
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required className={inputCls} />
        </Labeled>
        <Labeled label="수단">
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
            {Object.entries(METHOD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="입금일">
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required className={inputCls} />
        </Labeled>
        <Labeled label="메모">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
        </Labeled>
      </div>
      <SubmitRow submitting={submitting} label="수금 저장" />
    </form>
  )
}

/* ===== 조정 폼 ===== */
function AdjustmentForm({
  ledgerId,
  onDone,
  onError,
}: {
  ledgerId: number
  onDone: () => void
  onError: (m: string) => void
}) {
  const [type, setType] = useState<AdjustmentType>('DISCOUNT')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await billingApi.applyAdjustment(ledgerId, { type, amount: Number(amount), reason })
      onDone()
    } catch (err) {
      onError(errMsg(err, '조정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <p className="text-sm font-semibold text-amber-800">금액 조정</p>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="유형">
          <select value={type} onChange={(e) => setType(e.target.value as AdjustmentType)} className={inputCls}>
            {Object.entries(ADJ_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="금액(크기)">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className={inputCls} />
        </Labeled>
      </div>
      <Labeled label="사유 (오딧 기록)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="예: 단골 10% 할인" className={inputCls} />
      </Labeled>
      <p className="text-xs text-amber-700">
        할인·대손은 서버가 자동 차감, 가산은 증액 처리합니다. 정정은 입력 부호를 그대로 적용합니다.
      </p>
      <SubmitRow submitting={submitting} label="조정 적용" />
    </form>
  )
}

/* ===== 이월 폼 ===== */
function CarryOverForm({
  ledgerId,
  onDone,
  onError,
}: {
  ledgerId: number
  onDone: () => void
  onError: (m: string) => void
}) {
  const [nextPeriodStart, setStart] = useState('')
  const [nextPeriodEnd, setEnd] = useState('')
  const [nextDueDate, setDue] = useState('')
  const [nextBaseAmount, setBase] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await billingApi.carryOver(ledgerId, {
        nextPeriodStart,
        nextPeriodEnd,
        nextDueDate: nextDueDate || undefined,
        nextBaseAmount: nextBaseAmount ? Number(nextBaseAmount) : undefined,
      })
      onDone()
    } catch (err) {
      onError(errMsg(err, '이월에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <p className="text-sm font-semibold text-violet-800">미수금 차월 이월</p>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="차월 시작일">
          <input type="date" value={nextPeriodStart} onChange={(e) => setStart(e.target.value)} required className={inputCls} />
        </Labeled>
        <Labeled label="차월 종료일">
          <input type="date" value={nextPeriodEnd} onChange={(e) => setEnd(e.target.value)} required className={inputCls} />
        </Labeled>
        <Labeled label="차월 납기 (선택)">
          <input type="date" value={nextDueDate} onChange={(e) => setDue(e.target.value)} className={inputCls} />
        </Labeled>
        <Labeled label="차월 기본액 (선택)">
          <input type="number" value={nextBaseAmount} onChange={(e) => setBase(e.target.value)} placeholder="미입력 시 자동 산정" className={inputCls} />
        </Labeled>
      </div>
      <p className="text-xs text-violet-700">현재 원장은 마감되고, 남은 미수금이 새 원장으로 이월·발행됩니다.</p>
      <SubmitRow submitting={submitting} label="이월 실행" />
    </form>
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

function ActionBtn({
  onClick,
  icon,
  tone,
  children,
}: {
  onClick: () => void
  icon: ReactNode
  tone: 'indigo' | 'emerald' | 'amber' | 'violet'
  children: ReactNode
}) {
  const cls = {
    indigo: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    amber: 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    violet: 'border border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition', cls)}
    >
      {icon}
      {children}
    </button>
  )
}

function SubmitRow({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <div className="flex justify-end">
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 disabled:opacity-60"
      >
        {submitting && <Loader2 size={14} className="animate-spin" />}
        {label}
      </button>
    </div>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  )
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}
