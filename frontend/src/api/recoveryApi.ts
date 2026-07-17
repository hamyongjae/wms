import { api } from '@/lib/api'

export interface FindUsernameResult {
  found: boolean
  maskedUsername: string | null
  message: string
}

export const recoveryApi = {
  // 아이디 찾기: 이름 + 이메일 → 마스킹된 아이디
  async findUsername(name: string, email: string): Promise<FindUsernameResult> {
    const { data } = await api.post<FindUsernameResult>('/api/auth/recovery/find-username', {
      name,
      email,
    })
    return data
  },
  // 비밀번호 재설정 요청(메일 발송) — 존재 여부와 무관하게 동일 메시지
  async requestPasswordReset(username: string, email: string): Promise<string> {
    const { data } = await api.post<{ message: string }>('/api/auth/recovery/password/request', {
      username,
      email,
    })
    return data.message
  },
  // 비밀번호 재설정 확정: 토큰 + 새 비밀번호
  async confirmPasswordReset(token: string, newPassword: string): Promise<string> {
    const { data } = await api.post<{ message: string }>('/api/auth/recovery/password/confirm', {
      token,
      newPassword,
    })
    return data.message
  },
}
