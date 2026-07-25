import { api } from '@/lib/api'

export const recoveryApi = {
  // [이메일 ID] 비밀번호 재설정 요청(메일 발송) — 이메일만으로. 존재 여부와 무관하게 동일 메시지
  async requestPasswordReset(email: string): Promise<string> {
    const { data } = await api.post<{ message: string }>('/api/auth/recovery/password/request', {
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
