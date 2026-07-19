import { addDays, endOfMonth } from '@/lib/dates'

/**
 * [출고 예정일 퀵 프리셋] 보관 시작일 기준으로 자주 쓰는 약정 기간을 원클릭 지정.
 * 계약 등록·수정·즉시 입고 팝업이 공통으로 사용 — 날짜 연산은 lib/dates 재사용(중복 제거).
 */
export default function OutboundDatePresets({
  startDate,
  onPick,
  className = '',
}: {
  startDate: string
  onPick: (dateStr: string) => void
  className?: string
}) {
  const disabled = !startDate
  const presets: Array<{ label: string; calc: () => string }> = [
    { label: '+7일', calc: () => addDays(startDate, 7) },
    { label: '+15일', calc: () => addDays(startDate, 15) },
    { label: '+30일', calc: () => addDays(startDate, 30) },
    { label: '당월 말일', calc: () => endOfMonth(startDate) },
  ]
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(p.calc())}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
