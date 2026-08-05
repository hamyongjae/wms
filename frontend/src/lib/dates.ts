/**
 * [공용 날짜 유틸] yyyy-MM-dd 문자열 기반 경량 연산.
 * 페이지마다 중복 정의되던 today/addDays/addMonths/getDurationDays 를 단일 소스로 통합.
 * Date 객체 생성을 최소화하고 UTC 고정 연산으로 타임존 흔들림을 차단한다.
 */

/**
 * 오늘 날짜 (yyyy-MM-dd, 로컬 타임존 기준).
 * [버그 이력] toISOString()은 UTC로 변환한 뒤 자르므로, UTC+9(한국)에서는 자정~오전 9시 사이에
 * 하루 전 날짜가 나오는 오프바이원 버그가 있었다(실측: 07:03에 출고일 기본값이 어제로 표시됨).
 * 반드시 로컬 getFullYear/Month/Date로 조합해야 한다.
 */
export const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 일수 더하기 (UTC 기준) */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 개월 더하기 — 하루 빼서 '한 달 구간'으로 (1/15 ~ 2/14) */
export function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * 두 날짜 사이 일수 (당일 포함).
 * 종료일이 없으면(출고 예정일 미정인 장기 계약) 시작일로 되돌리지 않고 '오늘'까지 진행 중인
 * 것으로 보고 계산한다 — 그래야 오래전에 시작한 무기한 계약이 "1일"로 잘못 표시되지 않는다.
 */
export function getDurationDays(startDate: string, endDate: string | null | undefined): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate ?? today()}T00:00:00Z`).getTime()
  return Math.round((end - start) / 86_400_000) + 1
}

/** 해당 날짜가 속한 달의 말일 (yyyy-MM-dd, UTC 기준) */
export function endOfMonth(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  // 다음 달 0일 = 이번 달 말일
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  return last.toISOString().slice(0, 10)
}

/** yyyy-MM-dd → '2026년 8월 2일' (0으로 채우지 않은 자연스러운 한글 표기) */
export function ymdKorean(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

/** yyyy-MM-dd → 'yyyy.MM.dd' — 좁은 카드·행에서 줄바꿈 없이 한 줄에 넣기 위한 짧은 표기 */
export const md = (s?: string | null) => (s ? s.replace(/-/g, '.') : '미정')
