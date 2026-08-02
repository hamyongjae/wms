import { api } from '@/lib/api'
import type { Page } from '@/api/yardApi'

export type OrderStatus = 'INBOUND' | 'OUTBOUND'
export type PaymentType = 'PREPAID' | 'POSTPAID'
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CARD'

export interface StorageOrder {
  id: number
  tenantId: number
  tenantName: string
  customerId: number
  customerName: string
  warehouseId: number
  warehouseName: string
  status: OrderStatus
  storageStartDate: string
  expectedEndDate: string | null
  actualEndDate: string | null
  monthlyFee: number
  capacityTons: number | null
  paymentType: PaymentType | null
  dueDate: string | null
  memo: string | null
  paymentMethod: PaymentMethod
  settlementUserId: number | null
  settlementUserName: string | null
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  autoBillingEnabled: boolean | null
}

export interface OrderCreate {
  customerId: number
  warehouseId: number
  storageStartDate: string
  expectedEndDate?: string
  monthlyFee: number
  paymentType?: PaymentType
  paymentMethod?: PaymentMethod
  settlementUserId?: number
  dueDate?: string // 납기일 — 선불=보관 시작일, 후불=보관 종료일 기본값(수동 변경 가능)
  capacityTons?: number // 보관 용량(톤)
  memo?: string
  // 정산서 생성 방식 — true: 매월 자동 생성, false(기본값): 수동 생성. 최초 청구서는 이 값과 무관하게 항상 자동 발행됨.
  autoBillingEnabled?: boolean
}

export interface OrderUpdate {
  storageStartDate?: string
  expectedEndDate?: string
  monthlyFee?: number
  capacityTons?: number // 보관 용량(톤)
  paymentType?: PaymentType // 선불/후불 — 변경 시 활성 원장 자동 재정산
  paymentMethod?: PaymentMethod
  settlementUserId?: number
  dueDate?: string // 납기일 — 선불=보관 시작일, 후불=보관 종료일 기본값(수동 변경 가능)
  memo?: string
  autoBillingEnabled?: boolean // 정산서 생성 방식(자동/수동)
}

export interface OrderStatusChange {
  targetStatus: OrderStatus
  actualEndDate?: string // 출고 처리 시 실제 출고일 (중도출고)
  actualStartDate?: string // 입고 되돌리기 시 실제 입고일 (지연입고)
  settledAmount?: number // 직접 입력한 실사용 보관료 (있으면 이 값으로 원장 재산정)
}

export const orderApi = {
  async list(): Promise<StorageOrder[]> {
    const { data } = await api.get<Page<StorageOrder>>('/api/orders', {
      params: { size: 500, sort: 'id,desc' },
    })
    return data.content
  },
  async get(id: number): Promise<StorageOrder> {
    const { data } = await api.get<StorageOrder>(`/api/orders/${id}`)
    return data
  },
  async create(body: OrderCreate): Promise<StorageOrder> {
    const { data } = await api.post<StorageOrder>('/api/orders', body)
    return data
  },
  async update(id: number, body: OrderUpdate): Promise<StorageOrder> {
    const { data } = await api.put<StorageOrder>(`/api/orders/${id}`, body)
    return data
  },
  // [입/출고 유형별 처리] 상태 전환 (정상/중도출고·정상/지연입고 + 매출 소급)
  async changeStatus(id: number, body: OrderStatusChange): Promise<StorageOrder> {
    const { data } = await api.patch<StorageOrder>(`/api/orders/${id}/status`, body)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/api/orders/${id}`)
  },
}
