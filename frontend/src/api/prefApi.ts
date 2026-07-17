import { api } from '@/lib/api'

/** 사용자 개인화 설정 API (메뉴 순서 등). */
export const prefApi = {
  async getMenuOrder(): Promise<string[]> {
    const { data } = await api.get<{ menuOrder: string[] }>('/api/preferences/me')
    return data.menuOrder ?? []
  },
  async saveMenuOrder(menuOrder: string[]): Promise<void> {
    await api.put('/api/preferences/me/menu-order', { menuOrder })
  },
}
