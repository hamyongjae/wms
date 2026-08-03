import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import Modal from '@/components/ui/Modal'

/**
 * ===== [계약 폼 공용 시각 템플릿] =====
 *
 * 계약 '등록'과 '수정'은 진입 경로만 다를 뿐 같은 업무다. 그런데도 화면 규격이
 * 조금씩 다르면 60대 현장 관리자는 매번 새 화면을 배우는 셈이 된다.
 *
 * 그래서 입력 박스 높이·모서리 곡률·라벨 크기·2열 간격 같은 시각 규격을 이 파일
 * 한 곳에만 정의하고, 등록/수정 팝업이 모두 여기서 상속받는다.
 * 규격을 바꿀 일이 생겨도 이 파일만 고치면 두 화면이 동시에 따라온다
 * (= 파편화가 구조적으로 재발할 수 없다).
 *
 * 기준은 앞서 최적화를 마친 '계약 등록' 화면의 콤팩트 2열 규격이다.
 */

/** 전체 폭(단일 컬럼) 입력 박스 — 창고 선택·메모처럼 넓게 쓰는 필드 */
export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:px-3 md:py-2 md:text-sm'

/**
 * [2열 콤팩트 폼 전용] 계약 등록/수정 팝업의 가로 2열 구간(날짜·보관료·결제 등) 규격.
 *   좁은 반쪽 폭에서 겹침·넘침이 없도록 높이(h-12)·테두리·곡률·여백을 모든 박스에 동일하게 고정한다.
 * min-w-0: 그리드 트랙은 minmax(0,1fr)라 넓어지지 않지만, 그리드 "아이템" 자체는 기본값이
 *   min-width:auto(콘텐츠 기준)라 셀 안의 네이티브 date input·긴 텍스트가 트랙 폭을 무시하고
 *   오른쪽으로 삐져나간다. 셀 div와 그 안의 입력 요소 모두에 min-w-0을 명시해야 실제로 줄어든다.
 */
export const gridCellCls = 'min-w-0'
export const gridInputCls =
  'h-12 w-full min-w-0 rounded-lg border border-slate-300 px-2.5 text-base outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:text-sm'
/** 계산 결과(보관일수·하루 보관료) — 규격은 입력 박스와 동일하되 강조색으로 '살아있는 값'임을 표시 */
export const gridReadonlyCls =
  'flex h-12 min-w-0 items-center justify-end rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-base font-semibold text-indigo-600 md:text-sm'
/** 단일 컬럼 라벨(labelCls)과 크기를 통일 — 2열/전체 폭 구간을 오가도 글자 크기가 흔들리지 않는다 */
export const gridLabelCls = 'mb-1 block truncate text-base font-semibold text-slate-700 md:text-sm'
/** 전체 폭 라벨 (단일 컬럼 필드용) */
export const labelCls = 'mb-1.5 block text-base font-semibold text-slate-700 md:text-sm md:font-medium'

/** 2열 격자 컨테이너 — 등록·수정이 같은 간격(gap-3)을 공유한다 */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3', className)}>{children}</div>
}

/**
 * 2열 격자 안의 한 칸 — 라벨 + 입력 요소 + (선택) 보조 설명.
 *
 * action: 라벨 줄 오른쪽 끝에 붙는 보조 스위치('출고일 미정' 등).
 *   입력 요소 위나 아래가 아니라 라벨 줄에 두는 이유는 두 가지다.
 *   1) 읽는 순서(라벨 → 입력값)를 끊지 않는다.
 *   2) 입력 영역의 높이가 모든 칸에서 h-12로 같아져 2열 격자의 가로 정렬이 깨지지 않는다.
 */
export function GridField({
  label,
  required,
  hint,
  action,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={gridCellCls}>
      <div className="mb-1 flex min-w-0 items-center justify-between gap-1">
        <span className={cn(gridLabelCls, 'mb-0')}>
          {label}
          {required && ' *'}
        </span>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

/** 전체 폭 필드 — 라벨 + 입력 요소 */
export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required && ' *'}
      </label>
      {children}
    </div>
  )
}

/**
 * 계약 대상 요약 배너 — 고객·창고처럼 폼에서 바꿀 수 없는 맥락 정보.
 * 폼 최상단에 고정해 "지금 무엇을 고치고 있는지"를 항상 보이게 한다.
 */
export function ContextBar({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <span className="block text-xs text-slate-500">{it.label}</span>
          <span className="block truncate text-sm font-semibold text-slate-800">{it.value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * [출고일 미정] 토글 — 장기 보관 계약처럼 종료일이 확정되지 않은 건을 표현한다.
 * GridField 의 action 슬롯(라벨 줄 오른쪽)에 넣어 쓴다.
 *
 * -my-1.5: 상하 여백을 음수 마진으로 상쇄해, 터치 영역은 넉넉히 키우면서도
 *   라벨 줄 자체의 높이는 늘리지 않는다(다른 칸과의 정렬 유지).
 * 켜지면 인디고 톤으로 반전돼, 폼을 훑을 때 '이 계약은 미정'이 한눈에 들어온다.
 */
export function UndecidedToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={cn(
        '-my-1.5 flex shrink-0 cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-semibold transition',
        checked ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 active:bg-slate-100',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      미정
    </label>
  )
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const pad2 = (n: number) => String(n).padStart(2, '0')
const toIso = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`
function parseIso(s: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) } : null
}

/**
 * [원클릭 달력 선택기]
 *
 * 네이티브 `<input type="date">`는 두 가지 문제가 있었다.
 * 1) iOS 위아래 휠 방식이라 연·월·일을 각각 돌려 맞추고 'Done'까지 눌러야 하는 다단계 조작.
 * 2) 빈 date input의 내부 위젯이 CSS 박스 크기를 무시하고 삐져나오는 렌더링 버그(실측 확인됨).
 *
 * 그래서 네이티브 input을 완전히 걷어내고, 탭하면 월 달력 그림(그리드)이 뜨는 자체 구현으로
 * 바꿨다. 날짜 칸을 한 번 탭하면 그 값이 바로 들어가고 팝업이 닫힌다(원클릭). 화면에 보이는
 * 것도 우리가 그린 텍스트뿐이라 앞서의 렌더링 버그가 애초에 발생할 수 없다.
 *
 * [폼 검증 주의] 네이티브 input이 없으므로 HTML5 required 검증이 더 이상 자동으로 걸리지 않는다.
 * 이 필드를 필수로 쓰는 화면은 반드시 제출 로직에서 값이 비어 있는지 직접 확인해야 한다.
 */
export function CalendarField({
  value,
  onChange,
  min,
  max,
  className,
  placeholder = '날짜 선택',
  format = (iso) => iso.replaceAll('-', '.'),
}: {
  value: string
  onChange: (v: string) => void
  min?: string
  max?: string
  className?: string
  placeholder?: string
  /** 값 표시 형식(기본: 2026.08.02). 화면마다 다른 표기가 필요하면 넘긴다. */
  format?: (iso: string) => string
}) {
  const [open, setOpen] = useState(false)
  // [연도 빠른 이동] 월 화살표만 있으면 몇 년 전 날짜를 고를 때 수십 번 눌러야 한다.
  //   'day'(평소 날짜 그리드) / 'year'(연도 선택 그리드) 두 화면을 헤더 탭으로 오간다.
  const [mode, setMode] = useState<'day' | 'year'>('day')
  const now = new Date()
  const [viewY, setViewY] = useState(() => parseIso(value)?.y ?? now.getFullYear())
  const [viewM, setViewM] = useState(() => parseIso(value)?.m0 ?? now.getMonth())
  // 연도 그리드에 보여줄 12개 중 첫 연도 (현재 연도가 그리드 중간쯤 오도록)
  const [yearGridStart, setYearGridStart] = useState(viewY - 5)

  function openPicker() {
    const p = parseIso(value)
    const y = p?.y ?? now.getFullYear()
    setViewY(y)
    setViewM(p?.m0 ?? now.getMonth())
    setYearGridStart(y - 5)
    setMode('day')
    setOpen(true)
  }

  function shiftMonth(delta: number) {
    const d = new Date(viewY, viewM + delta, 1)
    setViewY(d.getFullYear())
    setViewM(d.getMonth())
  }

  function openYearGrid() {
    setYearGridStart(viewY - 5)
    setMode('year')
  }

  function pickYear(y: number) {
    setViewY(y)
    setMode('day')
  }

  function shiftYearGrid(delta: number) {
    setYearGridStart((s) => s + delta * 12)
  }

  /** 연도 전체가 [min, max] 밖이면 어차피 고를 수 있는 날짜가 없으므로 그리드에서 비활성화 */
  function yearDisabled(y: number): boolean {
    if (min != null && `${y}-12-31` < min) return true
    if (max != null && `${y}-01-01` > max) return true
    return false
  }

  // [스와이프 이동] 좌우로 훑으면 이전/다음 달(연도 그리드에서는 이전/다음 12년) — 화살표 버튼과
  //   동일한 동작을 손가락으로도
  const touchStartX = useRef<number | null>(null)
  function onSwipeStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function onSwipeEnd(e: TouchEvent) {
    if (touchStartX.current == null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(delta) > 40) {
      const dir = delta > 0 ? -1 : 1
      if (mode === 'day') shiftMonth(dir)
      else shiftYearGrid(dir)
    }
    touchStartX.current = null
  }

  const firstWeekday = new Date(viewY, viewM, 1).getDay()
  const dayCount = new Date(viewY, viewM + 1, 0).getDate()
  const todayIso = toIso(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={cn(className, 'flex items-center text-left', !value && 'text-slate-400')}
      >
        {value ? format(value) : placeholder}
      </button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title="날짜 선택">
          <div className="space-y-3" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd}>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => (mode === 'day' ? shiftMonth(-1) : shiftYearGrid(-1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                title={mode === 'day' ? '이전 달' : '이전 12년'}
              >
                <ChevronLeft size={20} />
              </button>
              {mode === 'day' ? (
                <button
                  type="button"
                  onClick={openYearGrid}
                  className="rounded-lg px-2 py-1 text-lg font-bold text-slate-800 transition hover:bg-slate-100"
                  title="연도 빠른 선택"
                >
                  {viewY}년 {viewM + 1}월
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode('day')}
                  className="rounded-lg px-2 py-1 text-lg font-bold text-slate-800 transition hover:bg-slate-100"
                  title="날짜 선택으로 돌아가기"
                >
                  {yearGridStart} - {yearGridStart + 11}
                </button>
              )}
              <button
                type="button"
                onClick={() => (mode === 'day' ? shiftMonth(1) : shiftYearGrid(1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                title={mode === 'day' ? '다음 달' : '다음 12년'}
              >
                <ChevronRight size={20} />
              </button>
            </div>

            {mode === 'year' ? (
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }).map((_, i) => {
                  const y = yearGridStart + i
                  const disabled = yearDisabled(y)
                  const selected = y === viewY
                  const isThisYear = y === now.getFullYear()
                  return (
                    <button
                      key={y}
                      type="button"
                      disabled={disabled}
                      onClick={() => pickYear(y)}
                      className={cn(
                        'flex h-12 items-center justify-center rounded-xl text-base font-semibold transition active:scale-95 disabled:cursor-not-allowed',
                        selected
                          ? 'bg-indigo-600 text-white'
                          : disabled
                            ? 'text-slate-300'
                            : isThisYear
                              ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                              : 'text-slate-700 hover:bg-slate-100',
                      )}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-400">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="py-1">
                      {w}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstWeekday }).map((_, i) => (
                    <div key={`blank-${i}`} />
                  ))}
                  {Array.from({ length: dayCount }).map((_, i) => {
                    const d = i + 1
                    const iso = toIso(viewY, viewM, d)
                    const disabled = (min != null && iso < min) || (max != null && iso > max)
                    const selected = iso === value
                    const isToday = iso === todayIso
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onChange(iso)
                          setOpen(false)
                        }}
                        className={cn(
                          'flex h-11 items-center justify-center rounded-xl text-base font-semibold transition active:scale-95 disabled:cursor-not-allowed',
                          selected
                            ? 'bg-indigo-600 text-white'
                            : disabled
                              ? 'text-slate-300'
                              : isToday
                                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                                : 'text-slate-700 hover:bg-slate-100',
                        )}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}

/**
 * [정산서 생성 방식] 수동 생성 / 매월 자동 생성 세그먼트 토글.
 *
 * 자동 생성을 켜면 매월 1일 새벽에 배치가 이번 달 청구서를 자동 발행한다는 사실을 안내
 * 문구로 보여줘 오조작을 막는다. 납기일은 전 계약 공통 고정값이 아니라 이 계약에 입력된
 * 납기일(dueDate)의 '일(day)'을 매달 재사용한다(BillingBatchService.recurringDueDate와 동일 규칙,
 * 31일처럼 없는 달은 말일로 자동 보정) — 그래서 안내 문구도 그 값을 그대로 반영해 보여준다.
 */
export function AutoBillingToggle({
  checked,
  onChange,
  dueDate,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  /** 폼에 입력된 납기일(yyyy-MM-dd). 매월 반복 납기일 계산의 기준(일자)으로 그대로 쓰인다. */
  dueDate?: string
}) {
  const anchorDay = parseIso(dueDate ?? '')?.d
  return (
    <div>
      <label className={labelCls}>정산서 생성 방식</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            'rounded-lg border py-3 text-base font-semibold transition md:py-2.5 md:text-sm',
            !checked
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 text-slate-500 active:bg-slate-50',
          )}
        >
          수동 생성
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            'rounded-lg border py-3 text-base font-semibold transition md:py-2.5 md:text-sm',
            checked
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-slate-300 text-slate-500 active:bg-slate-50',
          )}
        >
          매월 자동 생성
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">
        {checked
          ? anchorDay != null
            ? `매월 1일 새벽에 이번 달 정산서가 자동 발행됩니다 (납기일: 매월 ${anchorDay}일 · 없는 달은 말일).`
            : '매월 1일 새벽에 이번 달 정산서가 자동 발행됩니다. 납기일은 아래 "납기일" 필드의 일자를 매달 기준으로 사용합니다.'
          : '정산 화면에서 담당자가 직접 정산서를 생성해야 합니다.'}
      </p>
    </div>
  )
}

/** '출고일 미정'이 켜졌을 때 날짜 입력창 자리를 대신하는 톤다운 표시 */
export function UndecidedPlaceholder() {
  return (
    <div className="flex h-12 min-w-0 items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold leading-tight text-slate-400">
      미정 · 장기 보관
    </div>
  )
}

/**
 * 폼 하단 액션 바 — Modal 의 footer 슬롯에 넣는다.
 * 버튼이 <form> 밖에 렌더되므로 submit 버튼은 form 속성으로 폼과 연결한다.
 */
export function FormActions({
  formId,
  onCancel,
  submitting,
  disabled,
  submitLabel,
  submittingLabel,
}: {
  formId: string
  onCancel: () => void
  submitting: boolean
  disabled?: boolean
  submitLabel: string
  submittingLabel: string
}) {
  return (
    <div className="flex gap-2 md:justify-end">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-slate-300 py-3.5 text-base font-semibold text-slate-600 transition active:bg-slate-50 md:flex-none md:rounded-lg md:px-4 md:py-2 md:text-sm md:font-medium md:hover:bg-slate-50"
      >
        취소
      </button>
      <button
        type="submit"
        form={formId}
        disabled={submitting || disabled}
        className="flex-1 rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-60 md:flex-none md:rounded-lg md:px-4 md:py-2 md:text-sm md:font-medium md:hover:bg-indigo-700"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  )
}
