/**
 * 물류 계약·입출고 날짜 정합성 검증 유틸 (프론트 1차 방어).
 * 모든 날짜는 표준 YYYY-MM-DD 문자열로 다룬다.
 * (YYYY-MM-DD는 사전식 문자열 비교가 곧 날짜 비교와 일치하므로 안전하게 대소 비교 가능)
 */

/** 오늘 날짜 (YYYY-MM-DD, 로컬 타임존). */
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 실제로 존재하는 날짜인지 검증.
 * JS Date의 자동 버퍼(예: 4월 31일 → 5월 1일, 2025-02-29 → 3월 1일) 오류를 차단한다.
 */
export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, mo - 1, d)
  // 롤오버가 일어났다면 원래 입력과 연/월/일이 달라진다
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

/**
 * 계약 기간 검증: 종료일 >= 시작일 (당일 계약 허용).
 * @returns 오류 메시지, 통과 시 null
 */
export function validateContractPeriod(start: string, end: string): string | null {
  if (!start || !end) return null
  if (!isRealDate(start)) return '계약 시작일이 유효하지 않은 날짜입니다.'
  if (!isRealDate(end)) return '계약 종료일이 유효하지 않은 날짜입니다.'
  if (end < start) return '계약 종료일은 시작일보다 빠를 수 없습니다. 날짜를 다시 확인해 주세요.'
  return null
}

/**
 * 입출고 날짜 검증.
 * - 출고(예정)일은 입고일보다 과거일 수 없다.
 * - 입고일은 미래 불가(실제 입고 확정 기준). 단 allowFutureInbound=true(예약)면 허용.
 * @returns 오류 메시지, 통과 시 null
 */
export function validateInOut(
  inbound: string,
  outbound: string,
  opts?: { allowFutureInbound?: boolean },
): string | null {
  const t = todayStr()
  if (inbound) {
    if (!isRealDate(inbound)) return '입고일이 유효하지 않은 날짜입니다.'
    if (!opts?.allowFutureInbound && inbound > t) {
      return '입고일은 오늘 이후로 지정할 수 없습니다. (예약 건만 미래 지정 가능)'
    }
  }
  if (outbound) {
    if (!isRealDate(outbound)) return '출고 예정일이 유효하지 않은 날짜입니다.'
    if (inbound && outbound < inbound) {
      return '출고일은 입고일보다 빠를 수 없습니다. 입출고 일시를 다시 확인해 주세요.'
    }
  }
  return null
}
