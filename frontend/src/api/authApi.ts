import { api } from '@/lib/api'
import type { UserRole } from '@/lib/auth'

// [방식 1] 아이디/비밀번호만 전송 — 소속 업체는 서버가 자동 해석
export interface LoginRequest {
  username: string
  password: string
}

// 백엔드 LoginResponse 와 1:1 매칭
export interface LoginResponse {
  tokenType: string
  accessToken: string
  userId: number
  username: string
  name: string
  role: UserRole
  tenantId: number | null       // 소셜 미완성(PENDING) 유저면 null
  registrationComplete: boolean // false면 회사 등록(Step 2)으로 유도
}

/**
 * [자체 가입] POST /api/auth/register-company 페이로드.
 * 백엔드 CompanyRegisterRequest 와 필드명이 정확히 일치해야 한다.
 */
export interface RegisterCompanyRequestDto {
  // 마스터(ADMIN) 계정
  adminUsername: string
  adminPassword: string
  adminName: string
  // 창고업체(Tenant)
  companyName: string
  businessNumber: string
  ceoName?: string
  phone?: string
  email?: string
  address?: string
}

/**
 * [소셜 케이스 A] POST /api/auth/social/register-company 페이로드.
 * 계정은 이미 소셜로 존재하므로 회사 정보만 보낸다(토큰 필요).
 * 백엔드 CompanyProfileRequest 와 일치.
 */
export interface CompanyProfileDto {
  companyName: string
  businessNumber: string
  ceoName?: string
  phone?: string
  email?: string
  address?: string
}

// 백엔드 UserResponse (GET /api/auth/me) 와 매칭
export interface MeResponse {
  id: number
  tenantId: number
  username: string
  name: string
  role: UserRole
  status: string
  createdAt: string
}

export const authApi = {
  async login(body: LoginRequest): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/api/auth/login', body)
    return data
  },
  async me(): Promise<MeResponse> {
    const { data } = await api.get<MeResponse>('/api/auth/me')
    return data
  },
  // [자체 가입] 회사 + 첫 ADMIN 동시 생성 → 바로 로그인된 토큰 반환
  async registerCompany(body: RegisterCompanyRequestDto): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/api/auth/register-company', body)
    return data
  },
  // [소셜 케이스 A] PENDING 유저가 회사 등록으로 가입 완료 (토큰 필요)
  async socialRegisterCompany(body: CompanyProfileDto): Promise<LoginResponse> {
    const { data } = await api.post<LoginResponse>('/api/auth/social/register-company', body)
    return data
  },
}
