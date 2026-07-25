// 입력값 포맷팅 헬퍼 — 외부 라이브러리 없이 정규식만으로 가볍게 처리.

/** 숫자만 남긴다. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * 국내 전화번호 자동 하이픈.
 * - 02 지역번호(서울): 02-XXX(X)-XXXX
 * - 그 외 지역/휴대폰: 0XX-XXX(X)-XXXX
 * 입력 도중에도 자연스럽게 끊어준다.
 */
export function formatPhone(value: string): string {
  const d = digitsOnly(value).slice(0, 11)

  if (d.startsWith('02')) {
    if (d.length <= 2) return d
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`
  }

  if (d.length <= 3) return d
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`
}

/**
 * 사업자등록번호 자동 하이픈: XXX-XX-XXXXX (총 10자리)
 */
export function formatBusinessNumber(value: string): string {
  const d = digitsOnly(value).slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/** 사업자번호 유효성(10자리 숫자) — 형식 검사용. */
export function isValidBusinessNumber(value: string): boolean {
  return digitsOnly(value).length === 10
}

/**
 * 천 단위 콤마 표시 문자열.
 * 숫자 외 문자는 모두 제거 후 포맷 (한글·영문·특수문자 오입력 원천 차단).
 * 예: "1000000" → "1,000,000", "abc12,3" → "123"
 */
export function formatThousands(value: string | number): string {
  const digits = digitsOnly(String(value))
  if (digits === '') return ''
  return Number(digits).toLocaleString('ko-KR')
}

/** 콤마·비숫자 제거 후 순수 number로 변환. 빈 값이면 null. */
export function parseThousands(value: string): number | null {
  const digits = digitsOnly(value)
  return digits === '' ? null : Number(digits)
}
