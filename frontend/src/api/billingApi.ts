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
  status: BillingStatus
  carriedOverToLedgerId: number | null
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

export interface CarryOverRequest {
  nextPeriodStart: string
  nextPeriodEnd: string
  nextBaseAmount?: number
  nextDueDate?: string
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

/** 중도 출고 일할 정산 결과 (preview/apply 공용) */
export interface MidReleaseSettlement {
  actualUsageAmount: number // 실제 사용 기간 청구액
  refundAmount: number // 환급액 (선납 후 중도출고)
  additionalChargeAmount: number // 추가 청구액 (후납형)
  effectiveEndDate: string
  ledger: BillingLedger
}

export const billingApi = {
  async list(): Promise<BillingLedger[]> {
    const { data } = await api.get<Page<BillingLedger>>('/api/billing/ledgers', {
      params: { size: 500, sort: 'id,desc' },
    })
    return data.content
  },
  async detail(id: number): Promise<LedgerDetail> {
    const { data } = await api.get<LedgerDetail>(`/api/billing/ledgers/${id}/detail`)
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
  async applyAdjustment(id: number, body: AdjustmentRequest): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/adjustments`, body)
    return data
  },
  async carryOver(id: number, body: CarryOverRequest): Promise<BillingLedger> {
    const { data } = await api.post<BillingLedger>(`/api/billing/ledgers/${id}/carry-over`, body)
    return data
  },
  // [중도출고 정산] 실제 출고일 기준 일할 정산 미리보기 (원장 변경 없음)
  async previewMidRelease(id: number, actualEndDate: string): Promise<MidReleaseSettlement> {
    const { data } = await api.post<MidReleaseSettlement>(
      `/api/billing/ledgers/${id}/mid-release/preview`,
      { actualEndDate },
    )
    return data
  },
  // [중도출고 정산] 정산 확정 — 원장에 조정 반영
  async applyMidRelease(id: number, actualEndDate: string): Promise<MidReleaseSettlement> {
    const { data } = await api.post<MidReleaseSettlement>(
      `/api/billing/ledgers/${id}/mid-release/apply`,
      { actualEndDate },
    )
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
}
