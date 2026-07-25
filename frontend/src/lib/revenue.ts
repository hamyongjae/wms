import { getDurationDays } from './dates'
import type { StorageOrder } from '@/api/orderApi'

/**
 * [보관 매출 파생 계산]
 *
 * 매출은 별도로 저장하지 않고 '계약(StorageOrder)'에서 그때그때 계산한다(파생 모델).
 *  → 계약을 삭제·수정하면 매출도 자동으로 즉시 재계산되어 유령 데이터·정합성 오류가 원천 차단된다.
 *
 * [누적 규칙] 계약의 보관료(monthlyFee)는 보관기간 전체에 대한 총 보관료로 보고,
 *   하루 매출 = 총 보관료 ÷ 보관일수(당일 포함). 특정 달 매출 = 하루 매출 × 그 달과 겹친 일수.
 *   출고 완료 계약은 실제 출고일까지, 진행 중 계약은 출고예정일까지 인식한다.
 */

export interface CustomerRevenue {
  customerId: number
  customerName: string
  amount: number
  share: number // 0~1 비중
}

export interface RevenueSummary {
  total: number
  contractCount: number // 이번 달 매출이 발생한 계약 수
  customerCount: number
  customers: CustomerRevenue[] // 매출 큰 순
}

const pad = (n: number) => String(n).padStart(2, '0')
const monthStartStr = (y: number, m1: number) => `${y}-${pad(m1)}-01`
const monthEndStr = (y: number, m1: number) => `${y}-${pad(m1)}-${pad(new Date(y, m1, 0).getDate())}`

/** ISO(yyyy-MM-dd) 문자열은 사전식 비교가 곧 날짜 비교 */
const maxDate = (a: string, b: string) => (a >= b ? a : b)
const minDate = (a: string, b: string) => (a <= b ? a : b)

/** 두 구간의 겹친 일수(당일 포함). 안 겹치면 0 */
function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = maxDate(aStart, bStart)
  const e = minDate(aEnd, bEnd)
  if (s > e) return 0
  return getDurationDays(s, e)
}

/** 한 계약이 [rangeStart, rangeEnd] 구간에 인식하는 매출액 */
function accruedInRange(o: StorageOrder, rangeStart: string, rangeEnd: string): number {
  if (!o.storageStartDate || !o.monthlyFee) return 0
  const start = o.storageStartDate
  // 출고 완료면 실제 출고일, 진행 중이면 출고예정일. 둘 다 없으면 구간 끝까지 진행으로 간주.
  const periodEnd = o.actualEndDate ?? o.expectedEndDate ?? rangeEnd
  const durationDays = getDurationDays(start, periodEnd)
  if (durationDays <= 0) return 0
  const dailyRate = o.monthlyFee / durationDays
  const days = overlapDays(start, periodEnd, rangeStart, rangeEnd)
  return Math.round(dailyRate * days)
}

/**
 * 임의 기간 [from, to]의 보관 매출 요약을 계약 목록에서 계산한다. (yyyy-MM-dd)
 */
export function computeRangeRevenue(orders: StorageOrder[], from: string, to: string): RevenueSummary {
  return aggregate(orders, from, to)
}

/**
 * 특정 연·월의 보관 매출 요약. (내부적으로 1일~말일 구간 계산)
 */
export function computeMonthlyRevenue(orders: StorageOrder[], year: number, month1: number): RevenueSummary {
  return aggregate(orders, monthStartStr(year, month1), monthEndStr(year, month1))
}

function aggregate(orders: StorageOrder[], rangeStart: string, rangeEnd: string): RevenueSummary {
  const byCustomer = new Map<number, CustomerRevenue>()
  let total = 0
  let contractCount = 0

  for (const o of orders) {
    const amount = accruedInRange(o, rangeStart, rangeEnd)
    if (amount <= 0) continue
    total += amount
    contractCount++
    const prev = byCustomer.get(o.customerId)
    if (prev) {
      prev.amount += amount
    } else {
      byCustomer.set(o.customerId, {
        customerId: o.customerId,
        customerName: o.customerName,
        amount,
        share: 0,
      })
    }
  }

  const customers = [...byCustomer.values()].sort((a, b) => b.amount - a.amount)
  for (const c of customers) c.share = total > 0 ? c.amount / total : 0

  return { total, contractCount, customerCount: customers.length, customers }
}
