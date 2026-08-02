/**
 * 보관기간 표시 — 시작일 ~ 종료일(또는 '출고일 미정')을 항상 같은 모양으로 보여준다.
 *
 * [이력] 처음엔 미정 건에 회색 배지를 따로 씌워 일반 날짜와 구분했는데, 그러면 카드마다
 *   보관기간 줄의 생김새가 달라져 오히려 "통일감이 없다"는 피드백을 받았다. 지금은 배지 없이
 *   양쪽 다 같은 글자 크기·같은 '~' 구분자로만 표시한다. 순수 표시용 span이라 클릭 핸들러를
 *   붙이지 않는다 — 출고일이 없으니 눌러 들어갈 상세 일정도 없다(터치 오작동 원천 차단).
 */
export default function DateRangeLabel({
  start,
  end,
  format = (s: string) => s,
  className,
}: {
  start: string
  end: string | null | undefined
  format?: (s: string) => string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span className={className}>
      {format(start)}
      <span className="text-slate-300"> ~ </span>
      {end ? format(end) : '출고일 미정'}
    </span>
  )
}
