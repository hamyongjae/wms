import { api } from '@/lib/api'
import type { Page } from '@/api/yardApi'

export type OrderStatus = 'PENDING' | 'IN_STORAGE' | 'PENDING_RELEASE' | 'RELEASED' | 'CANCELLED'
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
  async release(id: number, actualEndDate: string): Promise<StorageOrder> {
    const { data } = await api.patch<StorageOrder>(`/api/orders/${id}/release`, { actualEndDate })
    return data
  },
  async unreleased(id: number): Promise<StorageOrder> {
    const { data } = await api.patch<StorageOrder>(`/api/orders/${id}/unreleased`, {})
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/api/orders/${id}`)
  },
}
