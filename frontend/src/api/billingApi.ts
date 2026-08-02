import { api } from '@/lib/api'
import type { Page } from '@/api/yardApi'

export type BillingStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CARRIED_OVER'
  | 'CANCELED'
export type BillingType = 'DAILY' | 'MONTHLY'
export type SettlementType = 'PREPAID' | 'POSTPAID'
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER'
export type AdjustmentType = 'DISCOUNT' | 'SURCHARGE' | 'WRITE_OFF' | 'CORRECTION'

// [차트] 월별 청구·수금 집계 1건 (서버 GROUP BY 결과)
export interface MonthlyRevenuePoint {
  yearMonth: string // yyyy-MM
  label: string // 예: "7월"
  billed: number // 확정 청구 총액
  collected: number // 실제 수금액
}

export interface BillingLedger {
  id: number
  tenantId: number
  storageOrderId: number
  customerId: number
  customerName: string
  ledgerNo: string
  billingType: BillingType
  settlementType: SettlementType
  periodStart: string
  periodEnd: string
  dueDate: string | null
  baseAmount: number
  carriedOverIn: number
  adjustmentTotal: number
  paidTotal: number
  balance: number
  outstanding: number // 실제 미수금 (balance>0), 음수면 0
  refundDue: number // 환불(선급금 반환) 대상 (balance<0의 절대값), 양수면 0
  refundCompleted: boolean // 환불 완료(지급 후 마감) 여부
  refundedAt: string | null // 환불 완료 시각 (미완료면 null)
  status: BillingStatus
  overdue: boolean // [파생] 납기 경과 + 미납 잔액 → 연체/미수
  daysOverdue: number // 납기 경과 일수 (연체 아니면 0)
  carriedOverToLedgerId: number | null
  taxInvoiceIssued: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export interface PaymentHistory {
  id: number
  billingLedgerId: number
  amount: number
  method: PaymentMethod
  paidOn: string
  memo: string | null
  reversed: boolean
  performedByUserId: number | null
  createdAt: string
}

export interface Adjustment {
  id: number
  billingLedgerId: number
  type: AdjustmentType
  amount: number
  reason: string
  performedByUserId: number | null
  createdAt: string
}

export interface LedgerDetail {
  ledger: BillingLedger
  payments: PaymentHistory[]
  adjustments: Adjustment[]
}

export interface PaymentRequest {
  amount: number
  method: PaymentMethod
  paidOn: string
  memo?: string
}

export interface AdjustmentRequest {
  type: AdjustmentType
  amount: number
  reason: string
}

export interface LedgerCreateRequest {
  storageOrderId: number
  billingType: BillingType
  settlementType: SettlementType
  periodStart: string
  periodEnd: string
  baseAmount?: number // 미지정 시 서버가 계약 요금으로 산정
  dailyRate?: number
  carriedOverIn?: number
  dueDate?: string
}

export const billingApi = {
  // [기간 조회] from·to(yyyy-MM-dd) 지정 시 청구 기간이 겹치는 원장만 서버에서 필터링
  async list(range?: { from?: string; to?: string }): Promise<BillingLedger[]> {
    const { data } = await api.get<Page<BillingLedger>>('/api/billing/ledgers', {
      params: { size: 500, sort: 'id,desc', from: range?.from, to: range?.to },
    })
    return data.content
  },
  async detail(id: number): Promise<LedgerDetail> {
    const { data } = await api.get<LedgerDetail>(`/api/billing/ledgers/${id}/detail`)
    return data
  },
  // [차트] 월별 청구·수금 추이 — DB GROUP BY 집계 (기본 6개월)
  async monthlyStats(months = 6): Promise<MonthlyRevenuePoint[]> {
    const { data } = await api.get<MonthlyRevenuePoint[]>('/api/billing/ledgers/stats/monthly', {
      params: { months },
    })
    return data
  },
  // [수동 청구] 특정 계약에 대해 청구 원장 1건 생성 (관리자) — DRAFT 상태로 반환
  async createLedger(body: LedgerCreateRequest): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>('/api/billing/ledgers', body)
    return data
  },
  async issue(id: number, dueDate?: string): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/issue`, {
      dueDate: dueDate ?? null,
    })
    return data
  },
  async recordPayment(id: number, body: PaymentRequest): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/payments`, body)
    return data
  },
  async reversePayment(paymentId: number): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/payments/${paymentId}/reverse`, {})
    return data
  },
  // [취소 롤백] 잘못 취소한 수금 건을 다시 유효한 수금으로 되돌린다
  async restorePayment(paymentId: number): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/payments/${paymentId}/restore`, {})
    return data
  },
  // 환불 완료 처리 — 환불 대상 금액을 실제 지급 후 마감(잔액 0·정산 마감)
  async completeRefund(id: number): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/refund-complete`, {})
    return data
  },
  // [납기일 변경] 정산서 개별 원장의 납기일을 직접 조정
  async changeDueDate(id: number, dueDate: string): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/due-date`, { dueDate })
    return data
  },
  async applyAdjustment(id: number, body: AdjustmentRequest): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/adjustments`, body)
    return data
  },
  // 미납(연체) 촉구 일괄 발송 → 결과 메시지 문자열
  async sendOverdueReminders(): Promise<string> {
    const { data } = await api.post<string>('/api/billing/ledgers/notify/overdue', {})
    return data
  },
  // 특정 원장 청구 안내(알림톡) 재발송 — 202 Accepted
  async sendPaymentRequest(id: number): Promise<void> {
    await api.post(`/api/billing/ledgers/${id}/notify/payment-request`, {})
  },
  // [정산 기록 삭제] 수금·조정 내역이 없는 원장만 가능(서버가 재검증) — 잘못 생성된 청구서 정리용
  async remove(id: number): Promise<void> {
    await api.delete(`/api/billing/ledgers/${id}`)
  },
}
