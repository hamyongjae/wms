// 보관료 관련 순수 계산 유틸 (UI와 분리). 계약 등록·즉시 입고 팝업에서 공용 사용.

/**
 * 두 날짜(YYYY-MM-DD) 사이의 보관 일수 — 당일 포함(inclusive).
 * - 빈 값/형식오류/역전(시작>종료) → null (계산 불가)
 * - 시작==종료(당일) → 1일. (0으로 나눔 방지)
 * UTC 기준으로 계산해 타임존/DST 영향 없이 정확한 일수를 낸다.
 */
export function storageDays(startStr: string, endStr: string): number | null {
  if (!startStr || !endStr) return null
  const s = Date.parse(`${startStr}T00:00:00Z`)
  const e = Date.parse(`${endStr}T00:00:00Z`)
  if (Number.isNaN(s) || Number.isNaN(e)) return null
  const days = Math.floor((e - s) / 86_400_000) + 1 // 당일 포함
  return days >= 1 ? days : null // 역전/0 이하 → 계산 불가
}

/**
 * 하루 보관료 = 보관료 ÷ 보관일수. 세 값이 모두 유효할 때만 숫자, 아니면 null(빈 값).
 * 반올림 정수로 반환. (0으로 나눔은 storageDays 가 null 을 반환하므로 원천 차단)
 */
export function calcDailyFee(fee: number | null, startStr: string, endStr: string): number | null {
  if (fee == null || fee <= 0) return null
  const days = storageDays(startStr, endStr)
  if (days == null) return null
  return Math.round(fee / days)
}

/**
 * [월 보관료 일할 계산] 백엔드 ProrationCalculator.prorateMonthly 와 동일한 규칙.
 * 달마다 (월 보관료 ÷ 그 달의 총일수) × 그 달 사용일수 를 누적한다(달별 일수 차이 반영).
 * 기간은 당일 포함(inclusive). 중도출고 실사용 보관료 프리뷰를 서버 계산과 일치시키기 위해 사용.
 *
 * @returns 반올림 정수(원). 값/기간이 유효하지 않으면 null.
 */
export function prorateMonthly(monthlyFee: number | null, startStr: string, endStr: string): number | null {
  if (monthlyFee == null || monthlyFee <= 0) return null
  if (!startStr || !endStr) return null
  const start = new Date(`${startStr}T00:00:00Z`)
  const end = new Date(`${endStr}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  if (end < start) return null

  let total = 0
  let cursor = start
  while (cursor <= end) {
    const year = cursor.getUTCFullYear()
    const month = cursor.getUTCMonth() // 0-based
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const monthEnd = new Date(Date.UTC(year, month, daysInMonth))
    const segmentEnd = monthEnd < end ? monthEnd : end
    const usedDays = Math.floor((segmentEnd.getTime() - cursor.getTime()) / 86_400_000) + 1
    total += (monthlyFee / daysInMonth) * usedDays
    cursor = new Date(segmentEnd.getTime() + 86_400_000) // 다음 세그먼트 시작 = segmentEnd + 1일
  }
  return Math.round(total)
}

/** 층별 단가 정보 (일 단가 + 최소 보관료) */
export interface FloorRate {
  unitPrice: number // 일 단가(원/일)
  minFee: number // 최소 보관료(원)
}

/**
 * [공통 보관료 계산 엔진] 층 단가 × 보관일수, 단 최소 보관료 미달 시 최소 보관료로 상향(Math.max).
 * 계약 등록·수정·즉시 입고 등 모든 파이프라인이 이 한 함수로 동일한 정산 원칙을 공유한다.
 *
 * @returns 보정된 총 보관료(원). 기간이 유효하지 않으면 최소 1일로 간주해 계산.
 */
export function calcFloorFee(rate: FloorRate, startStr: string, endStr: string): number {
  const days = storageDays(startStr, endStr) ?? 1
  const base = rate.unitPrice * Math.max(days, 1)
  return Math.max(base, rate.minFee ?? 0)
}
