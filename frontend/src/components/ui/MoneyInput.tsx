import { type ChangeEvent } from 'react'
import { digitsOnly } from '@/lib/format'

/**
 * 천 단위 콤마 실시간 포맷 금액 입력창.
 *
 * [데이터 원칙]
 * - 화면(UI): 콤마가 들어간 문자열로 표시 (가독성)
 * - State/Payload: 콤마·비숫자를 제거한 순수 number로 보관 (부모가 number|null을 소유)
 * - 오입력 차단: 입력값에서 숫자만 남겨 한글·영문·특수문자 원천 방지
 *
 * value를 number로 받아 표시 문자열을 파생하므로 별도 문자열 state가 없어
 * 리렌더/포커스 흐름이 단순하고 매끄럽다.
 */
export default function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
  id,
  autoFocus,
  required,
  suffix = '원',
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  className?: string
  id?: string
  autoFocus?: boolean
  required?: boolean
  suffix?: string
}) {
  const display = value == null || Number.isNaN(value) ? '' : value.toLocaleString('ko-KR')

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const digits = digitsOnly(e.target.value)
    onChange(digits === '' ? null : Number(digits))
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        className={className}
      />
      {suffix && display !== '' && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  )
}
