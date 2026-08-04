import { api } from '@/lib/api'

export interface PushSubscribeBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  userAgent?: string
}

export const pushApi = {
  // pushManager.subscribe()에 넘길 VAPID 공개키
  async vapidPublicKey(): Promise<string> {
    const { data } = await api.get<{ publicKey: string }>('/api/push/vapid-public-key')
    return data.publicKey
  },
  async subscribe(body: PushSubscribeBody): Promise<void> {
    await api.post('/api/push/subscriptions', body)
  },
  async unsubscribe(endpoint: string): Promise<void> {
    await api.delete('/api/push/subscriptions', { params: { endpoint } })
  },
}
