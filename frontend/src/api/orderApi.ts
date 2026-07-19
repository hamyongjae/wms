import { api } from '@/lib/api'
import type { Page } from '@/api/yardApi'

export type OrderStatus = 'INBOUND' | 'OUTBOUND'
export type PaymentType = 'PREPAID' | 'POSTPAID'

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
  totalVolume: number | null
  paymentType: PaymentType
  memo: string | null
}

export interface OrderCreate {
  customerId: number
  warehouseId: number
  storageStartDate: string
  expectedEndDate?: string
  monthlyFee: number
  paymentType?: PaymentType
  totalVolume?: number
  memo?: string
}

export interface OrderUpdate {
  storageStartDate?: string
  expectedEndDate?: string
  monthlyFee?: number
  totalVolume?: number
  memo?: string
}

export interface OrderStatusChange {
  targetStatus: OrderStatus
  actualEndDate?: string // 출고 처리 시 실제 출고일 (중도출고)
  actualStartDate?: string // 입고 되돌리기 시 실제 입고일 (지연입고)
  applySettlement?: boolean // 중도출고 보관료 소급/차감 여부
}

export const orderApi = {
  async list(): Promise<StorageOrder[]> {
    const { data } = await api.get<Page<StorageOrder>>('/api/orders', {
      params: { size: 500, sort: 'id,desc' },
    })
    return data.content
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
