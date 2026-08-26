import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { billingApi, type BillingLedger } from '@/api/billingApi'
import { cn } from '@/lib/cn'
import { orderSync } from '@/lib/orderEvents'
import { CalendarField, FieldGrid, GridField, gridInputCls, gridReadonlyCls } from '@/components/order/orderFormUi'
import MoneyInput from '@/components/ui/MoneyInput'
import { md, today } from '@/lib/dates'

/**
 * [정산 일정 수정 — 단일 공용 템플릿] 회차의 정산 시작일·종료일·입금액·정산금액을 한
 * 폼에서 고친다. 계약별 '정산 이력'(OrdersPage)과 전역 '정산 관리'(BillingPage) 양쪽
 * 진입 경로가 이 컴포넌트 하나를 그대로 가져다 쓴다 — 두 화면의 '정산서' 수정 UI가
 * 서로 다르면 사용자가 같은 일을 두 가지 방식으로 배워야 하므로, 로직·문구·스타일을
 * 이 파일 한 곳에만 둔다.
 */

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}

export default function ScheduleEditForm({
  ledger,
  lockStartDate,
  onDone,
  onCancel,
}: {
  ledger: BillingLedger
  /** [1회차 잠금] 값이 있으면 이 회차는 계약의 보관 시작일과 항상 같아야 하는 1회차라는
   *  뜻 — 서버(reconcileSchedulePlacement)도 동일하게 강제하므로, 자유 입력을 열어뒀다가
   *  저장 시점에 에러를 띄우는 대신 아예 이 값으로 고정해 화면에서부터 어긋날 수 없게 한다. */
  lockStartDate?: string
  onDone: () => void
  onCancel: () => void
}) {
  const [periodStart, setPeriodStart] = useState(lockStartDate ?? ledger.periodStart)
  const [periodEnd, setPeriodEnd] = useState(ledger.periodEnd)
  const [baseAmount, setBaseAmount] = useState<number | null>(Math.round(ledger.baseAmount))
  const [paidAmount, setPaidAmount] = useState<number | null>(Math.round(ledger.paidTotal))
  // [입금일 기준 매출] 이 입금액이 실제로 통장에 찍힌 날짜 — 매출관리 화면이 이 날짜로 매출을
  // 인식하므로, 과거에 받은 입금을 뒤늦게 입력할 땐 오늘이 아니라 실제 입금일을 골라야 한다.
  // [기존 입금일 프리필] 다른 필드(입금액·정산금액)는 원장의 현재 값을 그대로 보여주는데
  //   이 필드만 항상 오늘 날짜로 비어 있으면, "이미 저장된 날짜를 보고 있다"고 착각해
  //   고쳐서 저장해도 다시 열면 또 오늘 날짜라 "안 바뀐다"고 느끼게 된다 — 실제 마지막
  //   유효 입금 건의 날짜를 가져와 채운다(입금 이력이 없으면 오늘을 그대로 둔다).
  const [paidOn, setPaidOn] = useState(today())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    billingApi
      .detail(ledger.id)
      .then((d) => {
        const last = d.payments.filter((p) => !p.reversed).sort((a, b) => (a.paidOn < b.paidOn ? -1 : 1)).at(-1)
        if (last) setPaidOn(last.paidOn)
      })
      .catch(() => {})
  }, [ledger.id])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (baseAmount == null || baseAmount < 0) return setError('청구액을 입력하세요.')
    if (paidAmount == null || paidAmount < 0) return setError('입금액을 입력하세요.')
    if (periodEnd < periodStart) return setError('종료일은 시작일보다 빠를 수 없습니다.')
    // [오터치 방지] 입금액이 실제로 바뀌는 경우만 변경 전후 금액을 보여주고 한 번 더 확인한다.
    const currentPaid = Math.round(ledger.paidTotal)
    if (paidAmount !== currentPaid) {
      if (!paidOn) return setError('입금 날짜를 입력하세요.')
      if (!window.confirm(`입금액을 ${won(currentPaid)}에서 ${won(paidAmount)}(으)로 정정하시겠습니까?\n입금일: ${md(paidOn)}`)) return
    }
    setSubmitting(true)
    try {
      await billingApi.editLedger(ledger.id, { periodStart, periodEnd, baseAmount, paidAmount, paidOn })
      onDone()
      orderSync.emit()
    } catch (err) {
      setError(errMsg(err, '일정 수정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-1.5 space-y-2.5 rounded-xl bg-amber-50/50 p-3.5 ring-1 ring-amber-200/60"
    >
      <FieldGrid>
        <GridField label="정산 시작일" hint={lockStartDate ? '1회차 · 보관 시작일 고정' : undefined}>
          {lockStartDate ? (
            <div className={gridReadonlyCls}>{md(periodStart)}</div>
          ) : (
            <CalendarField value={periodStart} onChange={setPeriodStart} max={periodEnd || undefined} className={gridInputCls} />
          )}
        </GridField>
        <GridField label="정산 종료일">
          <CalendarField value={periodEnd} onChange={setPeriodEnd} min={periodStart || undefined} className={gridInputCls} />
        </GridField>
        <GridField label="입금액" hint="실제 입금 처리됩니다">
          <MoneyInput value={paidAmount} onChange={setPaidAmount} required className={cn(gridInputCls, 'pr-8')} />
        </GridField>
        <GridField label="정산금액">
          <MoneyInput value={baseAmount} onChange={setBaseAmount} required className={cn(gridInputCls, 'pr-8')} />
        </GridField>
        <GridField label="입금 날짜" hint="매출관리에 이 날짜로 반영됩니다">
          <CalendarField value={paidOn} onChange={setPaidOn} max={today()} className={gridInputCls} />
        </GridField>
      </FieldGrid>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-white"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-60"
        >
          {submitting ? '저장 중…' : '저장'}
        </button>
      </div>
    </form>
  )
}
