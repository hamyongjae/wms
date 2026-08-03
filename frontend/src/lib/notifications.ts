import { billingApi, type BillingLedger } from '@/api/billingApi'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { isActive } from './orderSchedule'

export type NotiTone = 'red' | 'amber' | 'slate'

export interface AppNotification {
  id: string
  text: string
  sub?: string
  tone: NotiTone
  to?: string // 클릭 시 이동 경로
}

// [버그 이력] toISOString() 기반 UTC 변환은 UTC+9에서 자정~오전 9시에 하루 전으로 밀리는 오프바이원 버그가 있다.
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const isOverdue = (l: BillingLedger) =>
  l.balance > 0 &&
  (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID') &&
  l.dueDate != null &&
  l.dueDate < today()

export interface NotificationResult {
  items: AppNotification[]
  urgentCount: number // 연체 등 즉시 처리 필요(빨간 배지 표시 기준)
}

/**
 * 실데이터에서 알림을 파생한다.
 * - 연체(미납·납기 경과) 청구: 요약 + 상위 개별 건
 * - 오늘 입고/출고 예정: 요약
 * 개별 API는 실패해도 빈 배열로 폴백해 알림 전체가 깨지지 않게 한다.
 */
export async function loadNotifications(): Promise<NotificationResult> {
  const [ledgers, orders] = await Promise.all([
    billingApi.list().catch(() => [] as BillingLedger[]),
    orderApi.list().catch(() => [] as StorageOrder[]),
  ])

  const t = today()
  const items: AppNotification[] = []

  const overdue = ledgers.filter(isOverdue)
  if (overdue.length > 0) {
    items.push({
      id: 'overdue-summary',
      text: `미납 청구 ${overdue.length}건이 납기를 지났습니다.`,
      tone: 'red',
      to: '/billing?filter=OVERDUE',
    })
    for (const l of overdue.slice(0, 3)) {
      items.push({
        id: `overdue-${l.id}`,
        text: `${l.customerName} · 미수 ${won(l.balance)}`,
        sub: `납기 ${l.dueDate} 경과`,
        tone: 'red',
        to: `/billing?ledger=${l.id}`,
      })
    }
  }

  const todayInbound = orders.filter((o) => o.storageStartDate === t)
  if (todayInbound.length > 0) {
    items.push({
      id: 'today-inbound',
      text: `오늘 입고 예정 ${todayInbound.length}건`,
      sub: todayInbound.map((o) => o.customerName).join(', '),
      tone: 'slate',
      to: '/calendar',
    })
  }

  const todayOutbound = orders.filter(
    (o) => o.actualEndDate === t || (o.expectedEndDate === t && isActive(o.status)),
  )
  if (todayOutbound.length > 0) {
    items.push({
      id: 'today-outbound',
      text: `오늘 출고 예정 ${todayOutbound.length}건`,
      sub: todayOutbound.map((o) => o.customerName).join(', '),
      tone: 'amber',
      to: '/calendar',
    })
  }

  return { items, urgentCount: overdue.length }
}
