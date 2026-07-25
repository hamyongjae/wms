import { api } from '@/lib/api'
import type { UserRole } from '@/lib/auth'

export type UserStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE'

// 백엔드 UserResponse 와 매칭
export interface Staff {
  id: number
  tenantId: number
  username: string
  name: string
  role: UserRole
  status: UserStatus
  bankName: string | null
  accountNumber: string | null
  accountHolder: string | null
  createdAt: string
}

export interface StaffAccount {
  bankName?: string
  accountNumber?: string
  accountHolder?: string
}

export interface StaffCreate {
  email: string // 로그인 아이디 = 이메일
  password: string
  name: string
  role?: UserRole
}

export const staffApi = {
  // 내 업체 계정 목록 (ADMIN)
  async list(): Promise<Staff[]> {
    const { data } = await api.get<Staff[]>('/api/auth/staff')
    return data
  },
  // 직원 계정 추가 (ADMIN) — tenantId는 서버가 토큰에서 상속
  async create(body: StaffCreate): Promise<Staff> {
    const { data } = await api.post<Staff>('/api/auth/signup-staff', body)
    return data
  },
  // 직원 주거래 계좌 등록·수정 (ADMIN)
  async updateAccount(id: number, body: StaffAccount): Promise<Staff> {
    const { data } = await api.patch<Staff>(`/api/auth/staff/${id}/account`, body)
    return data
  },
}
