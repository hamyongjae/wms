import { api } from '@/lib/api'

export interface TenantInfo {
  id: number
  name: string
  businessNumber: string | null
  ceoName: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: string
  defaultStoragePeriodDays: number | null
}

export interface TenantUpdate {
  name: string
  ceoName?: string
  phone?: string
  email?: string
  address?: string
  defaultStoragePeriodDays?: number
}

export const tenantApi = {
  // 로그인한 사용자의 소속 업체 정보
  async me(): Promise<TenantInfo> {
    const { data } = await api.get<TenantInfo>('/api/tenants/me')
    return data
  },
  // 내 업체 정보 수정 (ADMIN) — 사업자번호는 변경 불가
  async update(body: TenantUpdate): Promise<TenantInfo> {
    const { data } = await api.put<TenantInfo>('/api/tenants/me', body)
    return data
  },
}
