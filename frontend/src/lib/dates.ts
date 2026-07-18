/**
 * [공용 날짜 유틸] yyyy-MM-dd 문자열 기반 경량 연산.
 * 페이지마다 중복 정의되던 today/addDays/addMonths/getDurationDays 를 단일 소스로 통합.
 * Date 객체 생성을 최소화하고 UTC 고정 연산으로 타임존 흔들림을 차단한다.
 */

/** 오늘 날짜 (yyyy-MM-dd) */
export const today = (): string => new Date().toISOString().slice(0, 10)

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

/** 두 날짜 사이 일수 (당일 포함) */
export function getDurationDays(startDate: string, endDate: string | null | undefined): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate ?? startDate}T00:00:00Z`).getTime()
  return Math.round((end - start) / 86_400_000) + 1
}
