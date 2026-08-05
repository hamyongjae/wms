import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { Trash2, Undo2 } from 'lucide-react'
import { billingApi, type PaymentHistory } from '@/api/billingApi'
import { cn } from '@/lib/cn'
import { orderSync } from '@/lib/orderEvents'
import { md } from '@/lib/dates'

/**
 * [입금 내역 — 개별 건 취소] 원장의 누적 입금액(paidTotal)은 여러 건이 쌓인 값이라,
 * 잘못 기록한 건 하나만 골라 지워야 할 때가 있다. 실제 돈이 오간 기록이므로 하드 삭제
 * 대신 '취소'(PaymentHistory.reversed=true)로 남긴다 — 서버(BillingLedger.reversePayment)가
 * paidTotal에서 그만큼 빼고 잔액·상태를 재계산하므로, 매출·미수금 집계가 paidTotal 파생값만
 * 보는 구조상 별도 반영 작업 없이 자동으로 맞아떨어진다. 취소는 복원으로 되돌릴 수 있다.
 */

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: '계좌이체',
  CASH: '현금',
  CARD: '카드',
  OTHER: '기타',
}
function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}

export default function PaymentHistoryList({
  ledgerId,
  isAdmin,
  onChanged,
}: {
  ledgerId: number
  isAdmin: boolean
  onChanged: () => void
}) {
  const [payments, setPayments] = useState<PaymentHistory[] | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function load() {
    billingApi
      .detail(ledgerId)
      .then((d) => setPayments(d.payments))
      .catch(() => setPayments([]))
  }

  useEffect(load, [ledgerId])

  async function toggle(p: PaymentHistory) {
    const action = p.reversed ? '복원' : '삭제'
    if (!window.confirm(`이 입금 건(${won(p.amount)})을 ${action}할까요?`)) return
    setBusyId(p.id)
    setError(null)
    try {
      if (p.reversed) await billingApi.restorePayment(p.id)
      else await billingApi.reversePayment(p.id)
      load()
      onChanged()
      orderSync.emit()
    } catch (err) {
      setError(errMsg(err, `입금 건 ${action}에 실패했습니다.`))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="px-0.5 text-xs font-semibold text-slate-500">입금 내역</p>
      {payments == null && <p className="px-1 py-1.5 text-xs text-slate-400">불러오는 중…</p>}
      {payments != null && payments.length === 0 && (
        <p className="px-1 py-1.5 text-xs text-slate-400">입금 내역이 없습니다.</p>
      )}
      {payments != null &&
        payments.map((p) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs ring-1',
              p.reversed ? 'bg-slate-50 text-slate-400 ring-slate-200' : 'bg-white text-slate-700 ring-slate-200',
            )}
          >
            <div className="min-w-0">
              <span className={cn('font-semibold', p.reversed && 'line-through')}>{won(p.amount)}</span>
              <span className="ml-1.5 text-slate-400">
                {md(p.paidOn)} · {METHOD_LABEL[p.method] ?? p.method}
              </span>
              {p.reversed && (
                <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  취소됨
                </span>
              )}
              {p.memo && <p className="mt-0.5 truncate text-slate-400">{p.memo}</p>}
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => toggle(p)}
                disabled={busyId === p.id}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition disabled:opacity-50',
                  p.reversed
                    ? 'text-indigo-600 ring-indigo-200 hover:bg-indigo-50'
                    : 'text-red-600 ring-red-200 hover:bg-red-50',
                )}
              >
                {p.reversed ? <Undo2 size={12} /> : <Trash2 size={12} />}
                {p.reversed ? '복원' : '삭제'}
              </button>
            )}
          </div>
        ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
