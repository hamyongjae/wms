import type { RevenuePayment } from '@/api/billingApi'

/**
 * [정산 원장 기준 매출 파생 계산 - 현금주의 · 입금일 인식]
 *
 * 매출은 별도로 저장하지 않고 '입금 이력(PaymentHistory)'에서 그때그때 계산한다(파생 모델).
 *  → 입금이 새로 기록되거나 취소되면 매출도 자동으로 즉시 재계산되어 유령 데이터·정합성 오류가 원천 차단된다.
 *
 * [입금일 그대로 인식하는 이유] 예전에는 원장 하나의 누적 입금액을 청구기간 전체에 걸쳐
 *   고르게 들어온 것으로 보고 일할로 쪼갰다. 하지만 실제 돈은 특정 하루에 통장으로 들어오므로,
 *   현장이 원하는 "그 날 얼마 들어왔나"와 어긋났다 — 지금은 각 입금 건을 그 입금일(paidOn)
 *   그대로, 쪼개지 않고 전액 반영한다.
 *
 * [제외 항목] 취소(CANCELED)된 원장에 달린 입금, 취소(reversed)된 입금 건은 서버가 이미
 *   제외하고 내려주므로(RevenuePaymentResponse) 여기서는 다시 걸러낼 필요가 없다.
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

/** 입금 목록 중 입금일(paidOn)이 [from, to](양끝 포함) 안에 있는 건만 골라 금액을 그대로 합산 */
export function sumPaymentsInRange(payments: RevenuePayment[], from: string, to: string): number {
  return payments.reduce((s, p) => (p.paidOn >= from && p.paidOn <= to ? s + p.amount : s), 0)
}

/**
 * 임의 기간 [from, to]의 입금일 기준 매출 요약을 입금 목록에서 계산한다. (yyyy-MM-dd)
 */
export function computeRangeRevenue(payments: RevenuePayment[], from: string, to: string): RevenueSummary {
  const byCustomer = new Map<number, CustomerRevenue>()
  const contractIds = new Set<number>()
  let total = 0

  for (const p of payments) {
    if (p.paidOn < from || p.paidOn > to) continue
    total += p.amount
    contractIds.add(p.storageOrderId)
    const prev = byCustomer.get(p.customerId)
    if (prev) {
      prev.amount += p.amount
    } else {
      byCustomer.set(p.customerId, {
        customerId: p.customerId,
        customerName: p.customerName,
        amount: p.amount,
        share: 0,
      })
    }
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.amount - a.amount)
  for (const c of customers) c.share = total > 0 ? c.amount / total : 0

  return { total, contractCount: contractIds.size, customerCount: customers.length, customers }
}
