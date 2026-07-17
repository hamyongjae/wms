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
  // 