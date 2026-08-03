import { getDurationDays } from './dates'
import type { BillingLedger } from '@/api/billingApi'

/**
 * [정산서 기준 매출 파생 계산 - 현금주의(실제 입금액)]
 *
 * 매출은 별도로 저장하지 않고 '정산 원장(BillingLedger)'에서 그때그때 계산한다(파생 모델).
 *  → 원장이 발행·조정·수금·취소되면 매출도 자동으로 즉시 재계산되어 유령 데이터·정합성 오류가 원천 차단된다.
 *
 * [현금주의를 쓰는 이유] 청구 확정 금액(발생주의)은 아직 안 들어온 돈도 "이번 달 매출"로
 *   잡혀 실제 현금 흐름과 어긋날 수 있다. 정산 관리 화면의 '기간 입금액'과 같은 기준(실제
 *   입금액 paidTotal)을 쓰면 두 화면이 같은 잣대로 일관되게 "실제로 얼마 들어왔나"를 보여준다.
 *
 * [누적 규칙] 원장 하나의 누적 입금액(paidTotal)은 그 청구기간 [periodStart, periodEnd]
 *   전체에 걸쳐 고르게 들어온 것으로 보고, 하루 매출 = 입금액 ÷ 청구일수(당일 포함).
 *   특정 구간 매출 = 하루 매출 × 그 구간과 겹친 일수 — 이러면 원장 기간이 달력 월을
 *   걸쳐도(예: 8/15~9/14) 8월·9월에 일수만큼 정확히 나뉘어 잡힌다(원장 시작월에 통째로 몰리지 않음).
 *
 * [제외 항목]
 *  - baseAmount+adjustmentTotal(확정 청구액)은 발생주의 지표라 제외 — 아직 입금 안 된 청구는
 *    매출에 잡히지 않는다(정산 관리의 미수금 목록에서 별도로 확인).
 *  - carriedOverIn(전 원장에서 넘어온 미수금)은 이번 기간에 새로 들어온 입금이 아니므로 제외.
 *  - CANCELED 원장은 청구 자체가 무효화된 것이라 제외. CARRIED_OVER는 이미 들어온 입금이
 *    유효했던 것이므로(잔액만 다음 원장으로 넘어간 것) 포함한다.
 */

export interface CustomerRevenue {
  customerId: number
  customerName: string
  amount: number
  share: number // 0~1 비중
}

export interface RevenueSummary {
  total: number
  contractCount: number // 이 구간에 매출이 발생한 계약(정산 대상) 수
  customerCount: number
  customers: CustomerRevenue[] // 매출 큰 순
}

/** ISO(yyyy-MM-dd) 문자열은 사전식 비교가 곧 날짜 비교 */
const maxDate = (a: string, b: string) => (a >= b ? a : b)
const minDate = (a: string, b: string) => (a <= b ? a : b)

/** 두 구간의 겹친 일수(당일 포함). 안 겹치면 0 */
export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = maxDate(aStart, bStart)
  const e = minDate(aEnd, bEnd)
  if (s > e) return 0
  return getDurationDays(s, e)
}

/**
 * 원장 하나의 누적 입금액(paidTotal)이 [rangeStart, rangeEnd] 구간에 일할로 인식하는 몫.
 * 정산 관리 화면의 '기간 입금액'(lib/billing.ts의 accruedPaidInRange)과 동일한 계산 —
 * 매출관리도 같은 기준(실제 입금)을 쓰므로 이 함수 하나를 공용으로 둔다.
 */
export function collectedInRange(l: BillingLedger, rangeStart: string, rangeEnd: string): number {
  if (l.status === 'CANCELED' || l.paidTotal <= 0) return 0
  const durationDays = getDurationDays(l.periodStart, l.periodEnd)
  if (durationDays <= 0) return 0
  const dailyRate = l.paidTotal / durationDays
  const days = overlapDays(l.periodStart, l.periodEnd, rangeStart, rangeEnd)
  return Math.round(dailyRate * days)
}

/**
 * 임의 기간 [from, to]의 정산서 기준 매출 요약을 원장 목록에서 계산한다. (yyyy-MM-dd)
 */
export function computeRangeRevenue(ledgers: BillingLedger[], from: string, to: string): RevenueSummary {
  const byCustomer = new Map<number, CustomerRevenue>()
  const contractIds = new Set<number>()
  let total = 0

  for (const l of ledgers) {
    const amount = collectedInRange(l, from, to)
    if (amount <= 0) continue
    total += amount
    contractIds.add(l.storageOrderId)
    const prev = byCustomer.get(l.customerId)
    if (prev) {
      prev.amount += amount
    } else {
      byCustomer.set(l.customerId, {
        customerId: l.customerId,
        customerName: l.customerName,
        amount,
        share: 0,
      })
    }
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.amount - a.amount)
  for (const c of customers) c.share = total > 0 ? c.amount / total : 0

  return { total, contractCount: contractIds.size, customerCount: customers.length, customers }
}
