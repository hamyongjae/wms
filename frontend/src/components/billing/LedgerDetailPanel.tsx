import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { Loader2, BadgeCheck, HandCoins, SlidersHorizontal, CalendarClock, CalendarCog, Undo2, Trash2 } from 'lucide-react'
import {
  billingApi,
  type LedgerDetail,
  type PaymentMethod,
  type AdjustmentType,
} from '@/api/billingApi'
import { cn } from '@/lib/cn'
import { orderSync } from '@/lib/orderEvents'
import { today, ymdKorean } from '@/lib/dates'
import { displayStatus } from '@/lib/billing'
import Modal from '@/components/ui/Modal'
import { CalendarField } from '@/components/order/orderFormUi'

/**
 * ===== [정산 상세 팝업 — 단일 공용 템플릿] =====
 *
 * '정산 관리' 화면에서 원장을 클릭했을 때와, 컨테이너 관리·입출고 일정에서 계약의 정산
 * 이력 중 한 회차를 열었을 때가 서로 다른 화면이면 사용자는 같은 일을 두 가지 방식으로
 * 배워야 한다. 그래서 원장 하나에 대한 조회·발행·수금·조정·이월·환불·삭제는 이 파일
 * 하나에만 구현하고, 두 진입 경로 모두 이 컴포넌트를 그대로 가져다 쓴다.
 *
 * 진입 경로별 차이는 오직 '원장을 어떻게 골랐는가' 뿐이다 — 목록에서 바로 고르든,
 * 계약의 회차 목록에서 고르든, 골라진 ledgerId 하나만 이 컴포넌트에 넘기면 된다.
 */

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

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

export default function LedgerDetailPanel({
  ledgerId,
  isAdmin,
  onClose,
  onChanged,
}: {
  ledgerId: number
  isAdmin: boolean
  onClose: () => void
  /** 발행·수금·조정·이월·환불·삭제 등으로 원장이 바뀌었을 때 호출 — 호출부 목록을 새로 읽는다 */
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<LedgerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'pay' | 'adjust' | 'duedate' | 'schedule' | null>(null)
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
  const canPay = l != null && l.balance > 0 && (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
  const canAdjust = l != null && (l.status === 'DRAFT' || l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID')
  // [환불 완료] 환불 대상 금액이 있고 아직 미완료일 때만 (이중 방어 — 백엔드에서도 재검증)
  const canRefund = l != null && (l.refundDue ?? Math.max(-l.balance, 0)) > 0 && !l.refundCompleted
  // [삭제 가능 조건] 서버가 최종 재검증하지만, 화면에서도 미리 걸러 헛클릭을 막는다.
  //   입금·조정 흔적이 없고 다음 원장으로 이월되지 않은 원장만 — 실제 돈이 오간 기록은 지울 수 없다.
  const canDelete =
    isAdmin && l != null && l.paidTotal === 0 && l.adjustmentTotal === 0 && l.status !== 'CARRIED_OVER'
  // [한 줄 고정] 버튼 개수가 상황마다 달라(입금/조정/납기일변경/환불완료/삭제) flex-wrap이면
  //   두 번째 줄로 밀리기 쉽다 — 실제로 보일 개수만큼 그리드 칸을 나눠 항상 한 줄에 맞춘다.
  const visibleActionCount = [
    canPay,
    canAdjust && isAdmin,
    canAdjust && isAdmin, // 납기일 변경 — 조정과 같은 조건으로 함께 뜬다
    canAdjust && isAdmin, // 일정 수정 — 조정과 같은 조건으로 함께 뜬다
    canRefund && isAdmin,
    canDelete,
  ].filter(Boolean).length

  async function handleCompleteRefund() {
    if (!window.confirm('환불 완료 처리하시겠습니까?\n환불 대상 금액을 지급 완료로 마감하고 잔액을 0원으로 정리합니다.')) return
    try {
      await billingApi.completeRefund(ledgerId)
      afterAction() // 상세·목록 비동기 재조회 (전체 새로고침 없음)
    } catch (err) {
      setActionError(errMsg(err, '환불 완료 처리에 실패했습니다.'))
    }
  }

  async function handleDelete() {
    if (!window.confirm('이 정산 기록을 삭제하시겠습니까?\n삭제하면 되돌릴 수 없습니다.')) return
    try {
      await billingApi.remove(ledgerId)
      onChanged() // 목록 갱신
      orderSync.emit()
      onClose() // 삭제된 원장이라 상세를 계속 보여줄 수 없음 — 패널 닫기
    } catch (err) {
      setActionError(errMsg(err, '삭제에 실패했습니다.'))
    }
  }

  return (
    <Modal open onClose={onClose} title={l?.customerName ? `${l.customerName} 정산서` : '정산서'} widthClass="max-w-2xl">
      {loading || !l ? (
        <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 요약 */}
          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                    displayStatus(l).cls,
                  )}
                >
                  {displayStatus(l).label}
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
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {/* 청구기간은 날짜 범위라 폭이 넓어 옆 칸(납기)과 붙으면 줄바꿈된 숫자가 헷갈린다 — 단독 한 줄 */}
              <Info label="청구기간" className="col-span-2">
                {ymdKorean(l.periodStart)} ~ {ymdKorean(l.periodEnd)}
              </Info>
              <Info label="납기">{l.dueDate ? ymdKorean(l.dueDate) : '—'}</Info>
              <Info label="기본 청구액">{won(l.baseAmount)}</Info>
              <Info label="이월 유입">{won(l.carriedOverIn)}</Info>
              <Info label="조정 합계">{won(l.adjustmentTotal)}</Info>
              <Info label="입금 합계" className="col-span-2">
                {won(l.paidTotal)}
              </Info>
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
                중도출고로 실청구액이 입금액보다 작아 환불(선급금 반환) 대상입니다.
              </p>
            )}
            {l.refundCompleted && l.refundedAt && (
              <p className="mt-1 text-right text-[11px] text-slate-400">
                {ymdKorean(l.refundedAt.slice(0, 10))} 환불 지급 완료 · 정산 마감
              </p>
            )}
          </section>

          {/* 액션 버튼 — 개수에 맞춰 칸을 나눠 항상 한 줄에 맞춘다 */}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${visibleActionCount || 1}, minmax(0, 1fr))` }}>
            {canPay && (
              <ActionBtn onClick={() => setMode(mode === 'pay' ? null : 'pay')} icon={<HandCoins size={15} />} tone="emerald">
                입금
              </ActionBtn>
            )}
            {canAdjust && isAdmin && (
              <ActionBtn
                onClick={() => setMode(mode === 'adjust' ? null : 'adjust')}
                icon={<SlidersHorizontal size={15} />}
                tone="amber"
              >
                금액 조정
              </ActionBtn>
            )}
            {canAdjust && isAdmin && (
              <ActionBtn
                onClick={() => setMode(mode === 'duedate' ? null : 'duedate')}
                icon={<CalendarClock size={15} />}
                tone="amber"
              >
                납기일 변경
              </ActionBtn>
            )}
            {canAdjust && isAdmin && (
              <ActionBtn
                onClick={() => setMode(mode === 'schedule' ? null : 'schedule')}
                icon={<CalendarCog size={15} />}
                tone="amber"
              >
                일정 수정
              </ActionBtn>
            )}
            {canRefund && isAdmin && (
              <ActionBtn onClick={handleCompleteRefund} icon={<BadgeCheck size={15} />} tone="emerald">
                환불 완료
              </ActionBtn>
            )}
            {canDelete && (
              <ActionBtn onClick={handleDelete} icon={<Trash2 size={15} />} tone="red">
                삭제
              </ActionBtn>
            )}
          </div>

          {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{actionError}</p>}

          {mode === 'pay' && (
            <PaymentForm ledgerId={ledgerId} defaultAmount={l.balance} onDone={afterAction} onError={setActionError} />
          )}
          {mode === 'adjust' && <AdjustmentForm ledgerId={ledgerId} onDone={afterAction} onError={setActionError} />}
          {mode === 'duedate' && (
            <DueDateForm ledgerId={ledgerId} currentDueDate={l.dueDate} onDone={afterAction} onError={setActionError} />
          )}
          {mode === 'schedule' && (
            <ScheduleEditForm
              ledgerId={ledgerId}
              currentPeriodStart={l.periodStart}
              currentPeriodEnd={l.periodEnd}
              currentBaseAmount={l.baseAmount}
              onDone={afterAction}
              onError={setActionError}
            />
          )}

          {/* 입금 이력 */}
          <section>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">입금 이력</h4>
            {detail!.payments.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">입금 내역 없음</p>
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
                        {METHOD_LABEL[p.method]} · {ymdKorean(p.paidOn)}
                      </span>
                      {p.reversed && <span className="ml-2 text-xs text-red-500">취소됨</span>}
                    </div>
                    {isAdmin && !p.reversed && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('이 입금 건을 취소(잔액 원복)할까요?')) return
                          try {
                            await billingApi.reversePayment(p.id)
                            afterAction()
                          } catch (err) {
                            setActionError(errMsg(err, '입금 취소에 실패했습니다.'))
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-slate-400 transition hover:text-red-600"
                      >
                        <Undo2 size={13} />
                        취소
                      </button>
                    )}
                    {isAdmin && p.reversed && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('이 입금 건을 다시 유효한 입금으로 되돌릴까요?')) return
                          try {
                            await billingApi.restorePayment(p.id)
                            afterAction()
                          } catch (err) {
                            setActionError(errMsg(err, '입금 복원에 실패했습니다.'))
                          }
                        }}
                        className="flex items-center gap-1 text-xs text-indigo-500 transition hover:text-indigo-700"
                      >
                        <Undo2 size={13} className="-scale-x-100" />
                        복원
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
    </Modal>
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
      onError(errMsg(err, '입금에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <p className="text-sm font-semibold text-emerald-800">입금</p>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="입금액(원)">
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
          <CalendarField value={paidOn} onChange={setPaidOn} className={inputCls} />
        </Labeled>
        <Labeled label="메모">
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
        </Labeled>
      </div>
      <SubmitRow submitting={submitting} label="입금 저장" />
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
  // [간소화] 회계 용어 4종(할인/가산/대손상각/정정) 중 실제로 자주 쓰는 '할인/추가청구' 2개만 노출한다.
  //   대손상각·정정은 과거 이력 표시(ADJ_LABEL)만 유지하고 새로 만드는 화면에서는 뺐다 —
  //   구분이 세분화될수록 60대 사용자가 "이게 뭐지" 하고 멈추는 지점이 늘어난다.
  const [type, setType] = useState<'DISCOUNT' | 'SURCHARGE'>('DISCOUNT')
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
      <div>
        <span className="mb-1 block text-xs font-medium text-slate-600">유형</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setType('DISCOUNT')}
            className={cn(
              'rounded-lg border py-2 text-sm font-semibold transition',
              type === 'DISCOUNT'
                ? 'border-amber-500 bg-amber-100 text-amber-800'
                : 'border-slate-300 bg-white text-slate-500',
            )}
          >
            할인 (차감)
          </button>
          <button
            type="button"
            onClick={() => setType('SURCHARGE')}
            className={cn(
              'rounded-lg border py-2 text-sm font-semibold transition',
              type === 'SURCHARGE'
                ? 'border-amber-500 bg-amber-100 text-amber-800'
                : 'border-slate-300 bg-white text-slate-500',
            )}
          >
            추가 청구 (가산)
          </button>
        </div>
      </div>
      <Labeled label="금액(크기)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className={inputCls} />
      </Labeled>
      <Labeled label="사유 (오딧 기록)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="예: 단골 10% 할인" className={inputCls} />
      </Labeled>
      <p className="text-xs text-amber-700">
        할인은 청구액에서 차감되고, 추가 청구는 청구액에 더해집니다.
      </p>
      <SubmitRow submitting={submitting} label="조정 적용" />
    </form>
  )
}

/* ===== 납기일 변경 폼 ===== */
function DueDateForm({
  ledgerId,
  currentDueDate,
  onDone,
  onError,
}: {
  ledgerId: number
  currentDueDate: string | null
  onDone: () => void
  onError: (m: string) => void
}) {
  const [dueDate, setDueDate] = useState(currentDueDate ?? today())
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await billingApi.changeDueDate(ledgerId, dueDate)
      onDone()
    } catch (err) {
      onError(errMsg(err, '납기일 변경에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <p className="text-sm font-semibold text-amber-800">납기일 변경</p>
      <Labeled label="새 납기일">
        <CalendarField value={dueDate} onChange={setDueDate} format={ymdKorean} className={inputCls} />
      </Labeled>
      <SubmitRow submitting={submitting} label="납기일 저장" />
    </form>
  )
}

/* ===== 일정 수정 폼 ===== */
function ScheduleEditForm({
  ledgerId,
  currentPeriodStart,
  currentPeriodEnd,
  currentBaseAmount,
  onDone,
  onError,
}: {
  ledgerId: number
  currentPeriodStart: string
  currentPeriodEnd: string
  currentBaseAmount: number
  onDone: () => void
  onError: (m: string) => void
}) {
  const [periodStart, setPeriodStart] = useState(currentPeriodStart)
  const [periodEnd, setPeriodEnd] = useState(currentPeriodEnd)
  const [baseAmount, setBaseAmount] = useState(String(Math.round(currentBaseAmount)))
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await billingApi.editLedger(ledgerId, { periodStart, periodEnd, baseAmount: Number(baseAmount) })
      onDone()
    } catch (err) {
      onError(errMsg(err, '일정 수정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <p className="text-sm font-semibold text-amber-800">일정 수정</p>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="청구 시작일">
          <CalendarField value={periodStart} onChange={setPeriodStart} format={ymdKorean} className={inputCls} />
        </Labeled>
        <Labeled label="청구 종료일">
          <CalendarField value={periodEnd} onChange={setPeriodEnd} format={ymdKorean} className={inputCls} />
        </Labeled>
      </div>
      <Labeled label="청구액(원)">
        <input
          type="number"
          min={0}
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
          required
          className={inputCls}
        />
      </Labeled>
      <p className="text-xs text-amber-700">다른 회차와 기간이 겹치면 저장할 수 없습니다.</p>
      <SubmitRow submitting={submitting} label="일정 저장" />
    </form>
  )
}

/* ===== 소품 ===== */
function ActionBtn({
  onClick,
  icon,
  tone,
  children,
}: {
  onClick: () => void
  icon: ReactNode
  tone: 'emerald' | 'amber' | 'red'
  children: ReactNode
}) {
  const cls = {
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    amber: 'border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100',
    red: 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-center text-xs font-medium leading-tight transition',
        cls,
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
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

function Info({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
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
