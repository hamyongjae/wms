import type { StorageOrder } from '@/api/orderApi'

/**
 * [입출고 일정 5분류] 캘린더(대시보드 미니달력 + /calendar 전체 일정)가 공용으로 쓰는
 * 상태 팔레트·판정 규칙. 백엔드 CalendarService.getEvents()의 분류 규칙과 동일하게 맞춰서,
 * 백엔드가 이미 계산해준 status를 쓰는 화면과 클라이언트에서 직접 계산하는 화면이
 * 항상 같은 색으로 보이게 한다.
 */
export type ScheduleCategory = 'IN_PENDING' | 'IN_DONE' | 'IN_INDEFINITE' | 'OUT_PENDING' | 'OUT_DONE'

/* [뮤티드 상태색] 원색 대신 채도를 눌러 익힌 톤 (마스터플랜 2.1과 동일 계열) */
export const SCHEDULE_META: Record<ScheduleCategory, { label: string; badge: string; dot: string }> = {
  IN_PENDING: { label: '입고예정', badge: 'bg-[#E9EEF3] text-[#5A748F] ring-[#D4DDE7]', dot: 'bg-[#5A748F]' },
  IN_DONE: { label: '입고', badge: 'bg-[#DCE4EC] text-[#3E5C76] ring-[#C7D3E0]', dot: 'bg-[#3E5C76]' },
  IN_INDEFINITE: { label: '출고일미정', badge: 'bg-[#EDE9F5] text-[#6B5B95] ring-[#DDD4EC]', dot: 'bg-[#6B5B95]' },
  OUT_PENDING: { label: '출고예정', badge: 'bg-[#F2E8E3] text-[#A65B44] ring-[#E4D2C9]', dot: 'bg-[#A65B44]' },
  OUT_DONE: { label: '출고', badge: 'bg-[#E9D9D2] text-[#7A3F2D] ring-[#DBC2B6]', dot: 'bg-[#7A3F2D]' },
}

/** 상태 모델은 INBOUND/OUTBOUND 이진 — 활성=아직 출고 안 됨(INBOUND). */
export const isActive = (s: StorageOrder['status']) => s === 'INBOUND'

/**
 * 계약의 입고 이벤트가 dateStr에 해당하면 그 카테고리, 아니면 null.
 * 출고일 미정(expectedEndDate==null)이면 예정/완료 구분 없이 항상 IN_INDEFINITE.
 */
export function inboundCategory(
  o: Pick<StorageOrder, 'status' | 'storageStartDate' | 'expectedEndDate'>,
  dateStr: string,
  todayStr: string,
): ScheduleCategory | null {
  if (o.storageStartDate !== dateStr) return null
  if (isActive(o.status) && o.expectedEndDate == null) return 'IN_INDEFINITE'
  return dateStr > todayStr ? 'IN_PENDING' : 'IN_DONE'
}

/**
 * 계약의 출고 이벤트가 dateStr에 해당하면 그 카테고리, 아니면 null.
 * 출고 지연(OVERDUE)은 별도 색 없이 출고예정(OUT_PENDING)에 합류한다 — "연체" 텍스트
 * 표시는 이 색상 분류와 무관하게 각 화면에서 별도로 계속 보여준다.
 */
export function outboundCategory(
  o: Pick<StorageOrder, 'status' | 'actualEndDate' | 'expectedEndDate'>,
  dateStr: string,
): ScheduleCategory | null {
  const released = !isActive(o.status)
  const outDate = released ? (o.actualEndDate ?? o.expectedEndDate) : o.expectedEndDate
  if (outDate == null || outDate !== dateStr) return null
  return released ? 'OUT_DONE' : 'OUT_PENDING'
}
