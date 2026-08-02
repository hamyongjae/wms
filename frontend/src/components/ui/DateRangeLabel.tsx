import { cn } from '@/lib/cn'

/**
 * 보관기간 표시 — 출고 예정일이 없는 장기/유연 계약을 일반 날짜와 시각적으로 구분한다.
 *
 * [배경] 출고일이 비어있으면 "~미정"처럼 화면에 흐릿하게 섞여 60대 현장 관리자가
 *   전산 오류로 오인하기 쉽다. 굵고 색이 다른 배지로 "정상적인 장기 보관 건"임을
 *   1초 만에 인지하도록 한다. 순수 표시용 span이라 클릭 핸들러를 붙이지 않는다 —
 *   출고일이 없으니 눌러 들어갈 상세 일정도 없다(터치 오작동 원천 차단).
 */
export default function DateRangeLabel({
  start,
  end,
  format = (s: string) => s,
  size = 'md',
  className,
}: {
  start: string
  end: string | null | undefined
  format?: (s: string) => string
  size?: 'sm' | 'md'
  className?: string
}) {
  if (end) {
    return (
      <span className={className}>
        {format(start)}
        <span className="text-slate-300"> ~ </span>
        {format(end)}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-slate-100 font-bold text-slate-500 ring-1 ring-slate-200',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-base',
        className,
      )}
    >
      {format(start)} ~ 출고일 미정
    </span>
  )
}
