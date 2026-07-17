import { api } from '@/lib/api'
import type { Page } from '@/api/yardApi'

export type CustomerType = 'INDIVIDUAL' | 'CORPORATE'
export type CustomerStatus = 'ACTIVE' | 'DORMANT' | 'BLACKLISTED'

// [슬림화] 주소/우편번호/비상연락/동의 필드 제거 — 화주 관리 핵심만
export interface Customer {
  id: number
  name: string
  customerType: CustomerType | null
  businessNumber: string | null
  phoneNumber: string | null
  email: string | null
  status: CustomerStatus
  blacklistReason: string | null
  blacklistedAt: string | null
  memo: string | null
}

// 상태 변경 요청 — BLACKLISTED 지정 시 reason 필수
export interface UpdateCustomerStatusRequestDto {
  status: CustomerStatus
  reason?: string
}

export interface CustomerUpsert {
  name: string
  customerType?: CustomerType
  businessNumber?: string
  phoneNumber?: string
  email?: string
  memo?: string
}

// 검색기/계약 폼에서 바인딩하는 고객 데이터 타입 별칭
export type CustomerDto = Customer

export const customerApi = {
  async list(name?: string): Promise<Customer[]> {
    const { data } = await api.get<Page<Customer>>('/api/customers', {
      params: { name: name || undefined, size: 500 },
    })
    return data.content
  },
  async create(body: CustomerUpsert): Promise<Customer> {
    const { data } = await api.post<Customer>('/api/customers', body)
    return data
  },
  async update(id: number, body: CustomerUpsert): Promise<Customer> {
    const { data } = await api.put<Customer>(`/api/customers/${id}`, body)
    return data
  },
  async changeStatus(id: number, body: UpdateCustomerStatusRequestDto): Promise<Customer> {
    const { data } = await api.patch<Customer>(`/api/customers/${id}/status`, body)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/api/customers/${id}`)
  },
}
