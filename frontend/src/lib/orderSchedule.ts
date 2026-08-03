import type { StorageOrder } from '@/api/orderApi'

/**
 * [입출고 일정 5분류] 캘린더(대시보드 미니달력 + /calendar 전체 일정)가 공용으로 쓰는
 * 상태 팔레트·판정 규칙. 백엔드 CalendarService.getEvents()의 분류 규칙과 동일하게 맞춰서,
 * 백엔드가 이미 계산해준 status를 쓰는 화면과 클라이언트에서 직접 계산하는 화면이
 * 항상 같은 색으로 보이게 한다.
 */
export type ScheduleCategory = 'IN_PENDING' | 'IN_DONE' | 'IN_INDEFINITE' | 'OUT_PENDING' | 'OUT_DONE'

/** 상태별 표시 이름. 색은 사용자가 설정에서 바꿀 수 있어 여기 두지 않는다(scheduleColors 참조). */
export const SCHEDULE_META: Record<ScheduleCategory, { label: string }> = {
  IN_PENDING: { label: '입고예정' },
  IN_DONE: { label: '입고' },
  IN_INDEFINITE: { label: '출고일미정' },
  OUT_PENDING: { label: '출고예정' },
  OUT_DONE: { label: '출고' },
}

/** 상태 표시 순서 (범례·설정 화면·집계에서 공용) */
export const SCHEDULE_CATEGORY_ORDER: ScheduleCategory[] = [
  'IN_PENDING',
  'IN_INDEFINITE',
  'IN_DONE',
  'OUT_PENDING',
  'OUT_DONE',
]

/**
 * [상태 배지 스타일] 색은 <html> 에 심어둔 CSS 변수에서 읽는다.
 *
 * Tailwind 임의값 클래스(`bg-[#5A748F]`)는 빌드 시점에 컴파일되므로 런타임에 만든 색은 먹지 않는다.
 * 그래서 배경·글자·테두리를 인라인 style 로 넘긴다. 변수는 설정에서 색을 저장하는 순간
 * 브라우저가 알아서 전파하므로 리렌더 신호가 따로 필요 없다.
 *
 * ring-1 대신 box-shadow 를 직접 쓴다(Tailwind ring 도 결국 box-shadow 다).
 */
export function scheduleBadgeStyle(cat: ScheduleCategory): React.CSSProperties {
  return {
    backgroundColor: `var(--sched-${cat}-bg)`,
    color: `var(--sched-${cat}-fg)`,
    boxShadow: `0 0 0 1px var(--sched-${cat}-ring)`,
  }
}

/** [상태 점] 미니달력의 색 점·범례에서 쓰는 단색 */
export function scheduleDotStyle(cat: ScheduleCategory): React.CSSProperties {
  return { backgroundColor: `var(--sched-${cat}-fg)` }
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
