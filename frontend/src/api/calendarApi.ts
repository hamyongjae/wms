import { api } from '@/lib/api'

/** 캘린더 이벤트 유형. */
export type CalendarEventType = 'INBOUND' | 'OUTBOUND' | 'BILLING'

/** 이벤트 진행 상태. */
export type CalendarEventStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE'

/**
 * 백엔드 시계열 API 연동 규격.
 * GET /api/calendar/events?from=&to= 응답과 1:1로 매칭한다.
 */
export interface CalendarEvent {
  id: number
  title: string
  startAt: string // ISO datetime
  endAt: string // ISO datetime
  type: CalendarEventType
  status: CalendarEventStatus
  customerName: string
  amount?: number | null // BILLING 타입일 때만 값(미수 잔액)
  startDate?: string | null // 시작일 (입고일/보관시작/청구기간 시작)
  endDate?: string | null // 종료일 (출고예정/보관종료/청구기간 종료)
  unitPrice?: number | null // 단가 (월 보관료/기본 청구액)
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 특정 월(1~12)의 이벤트를 백엔드에서 받아온다.
 * 달력이 6주(42칸)를 그리므로, 전월 말~익월 초까지 넉넉히 포함하도록
 * 해당 월 1일 6일 전 ~ 말일 14일 후 범위로 조회한다.
 */
export async function getMonthEvents(year: number, month1to12: number): Promise<CalendarEvent[]> {
  const first = new Date(year, month1to12 - 1, 1)
  const last = new Date(year, month1to12, 0)

  const from = new Date(first)
  from.setDate(from.getDate() - 6)
  const to = new Date(last)
  to.setDate(to.getDate() 