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
 * 보관료(월 합계) = 하루 보관료 × 보관일수. calcDailyFee의 역계산 — 담당자가 하루 단가를
 * 먼저 정해뒀을 때(층별 단가표 등) 그 값으로 전체 보관료를 바로 채우기 위한 용도.
 * 세 값이 모두 유효할 때만 숫자, 아니면 null(빈 값).
 */
export function calcMonthlyFeeFromDaily(dailyFee: number | null, startStr: string, endStr: string): number | null {
  if (dailyFee == null || dailyFee <= 0) return null
  const days = storageDays(startStr, endStr)
  if (days == null) return null
  return Math.round(dailyFee * days)
}
