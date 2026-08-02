import type { BillingLedger } from '@/api/billingApi'

/**
 * [파생 상태] 청구 원장의 화면 표시 상태 — 저장하지 않고 시점에 계산한다 (운영 가이드 2.2).
 * 청구·정산 화면과 계약 정산 타임라인이 공용으로 사용.
 */

/** [버그 이력] toISOString() 기반 UTC 변환은 UTC+9에서 자정~오전 9시에 하루 전으로 밀리는 오프바이원 버그가 있다. */
export const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const wonFmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 납기 경과 + 잔액 존재 → 연체 (파생) */
export function isOverdue(l: BillingLedger): boolean {
  return (
    l.balance > 0 &&
    (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID') &&
    l.dueDate != null &&
    l.dueDate < todayStr()
  )
}

/** 납기일 기준 경과(+)/잔여(-) 일수 (UTC 일 단위) */
export function daysFromDue(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime()
  const now = new Date(`${todayStr()}T00:00:00Z`).getTime()
  return Math.round((now - due) / 86_400_000)
}

/** 저장 상태 라벨 (파생 미적용 원형) */
const RAW_META: Record<BillingLedger['status'], { label: string; cls: string }> = {
  DRAFT: { label: '작성중', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  ISSUED: { label: '발행', cls: 'bg-[#E9EEF3] text-[#5A748F] ring-[#D4DDE7]' },
  PARTIALLY_PAID: { label: '부분수금', cls: 'bg-[#EFEBE4] text-[#8A8172] ring-[#E2DCD1]' },
  PAID: { label: '완납', cls: 'bg-[#E9EFEA] text-[#5C7C6B] ring-[#D3DFD6]' },
  CARRIED_OVER: { label: '이월마감', cls: 'bg-violet-50 text-violet-700 ring-violet-200' },
  CANCELED: { label: '취소', cls: 'bg-slate-100 text-slate-400 ring-slate-200' },
}

/**
 * 저장 상태 × 납기일 → 화면 표기.
 *  - 발행/부분수금 + 납기 전 → '입금예정' (더스티블루)
 *  - 발행/부분수금 + 납기 경과·잔액>0 → '연체 N일' (클레이)
 */
export function displayStatus(l: BillingLedger): { label: string; cls: string } {
  if (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID') {
    if (isOverdue(l)) {
      return { label: `연체 ${daysFromDue(l.dueDate!)}일`, cls: 'bg-[#F2E8E3] text-[#A65B44] ring-[#E4D2C9]' }
    }
    return {
      label: l.status === 'PARTIALLY_PAID' ? '부분입금 · 입금예정' : '입금예정',
      cls: 'bg-[#E9EEF3] text-[#5A748F] ring-[#D4DDE7]',
    }
  }
  return RAW_META[l.status]
}

/** 미결(잔액이 남을 수 있는) 원장인지 — 정산 대상 판별용 */
export function isOpenLedger(l: BillingLedger): boolean {
  return l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID'
}
