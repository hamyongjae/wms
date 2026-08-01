import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

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
 * 모바일 우선: 손가락 오작동·노안을 고려해 기본은 크게(py-3, text-base),
 * md 이상 데스크톱에서는 정보 밀도를 위해 기존 규격(py-2, text-sm)으로 축소한다.
 */

/** 입력 박스 표준 규격 — 등록·수정 모든 input/select/textarea가 공유 */
export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:px-3 md:py-2 md:text-sm'

/**
 * 읽기 전용 박스 규격 — 높이·곡률은 입력 박스와 완전히 동일하되,
 * 회색 배경 + 커서 없음으로 "만질 수 없는 값"임을 시각적으로 구분한다.
 * 규격을 유지하는 이유: 폼의 격자 정렬이 깨지면 화면이 들쭉날쭉해 보인다.
 */
export const readonlyCls =
  'flex min-h-[46px] w-full items-center rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-3 text-base font-semibold text-slate-500 md:min-h-[38px] md:px-3 md:py-2 md:text-sm'

/** 파생값(계산 결과) 표시 박스 — 읽기 전용이지만 '살아있는 값'이라 강조색을 쓴다 */
export const derivedCls =
  'flex min-h-[46px] w-full items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-base font-semibold text-indigo-600 md:min-h-[38px] md:px-3 md:text-sm'

/** 라벨 표준 규격 */
export const labelCls = 'mb-1.5 block text-base font-semibold text-slate-700 md:text-sm md:font-medium'

/** 필드 한 칸 — 라벨 + 입력 요소. required면 라벨 뒤에 * 를 붙인다. */
export function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className={labelCls}>
        {label}
        {required && ' *'}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

/**
 * 수정 불가한 고정 정보 — 규격은 입력 박스와 같지만 회색 톤으로 잠금을 표현한다.
 * 실제 input 이 아니라 div 라서 탭해도 키보드가 뜨지 않는다(오터치 원천 차단).
 */
export function ReadOnlyField({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className={readonlyCls}>{value ?? '—'}</div>
    </Field>
  )
}

/** 폼 본문 2열 격자 — 모바일 1열, sm 이상 2열. 등록·수정이 같은 간격을 쓴다. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', className)}>{children}</div>
}

/**
 * 계약 대상 요약 배너 — 고객·창고처럼 폼에서 바꿀 수 없는 맥락 정보.
 * 폼 최상단에 고정해 "지금 무엇을 고치고 있는지"를 항상 보이게 한다.
 */
export function ContextBar({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <span className="block text-xs text-slate-400">{it.label}</span>
          <span className="block truncate font-medium text-slate-700">{it.value ?? '—'}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * 폼 하단 액션 바.
 * 모바일에선 sticky 로 화면 바닥에 붙어 스크롤 위치와 무관하게 항상 한 번에 누를 수 있고,
 * 데스크톱에선 일반 흐름의 우측 정렬 버튼으로 돌아간다.
 */
export function FormActions({
  onCancel,
  submitting,
  disabled,
  submitLabel,
  submittingLabel,
}: {
  onCancel: () => void
  submitting: boolean
  disabled?: boolean
  submitLabel: string
  submittingLabel: string
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-2 flex gap-2 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur md:static md:mx-0 md:mt-0 md:justify-end md:border-0 md:bg-transparent md:px-0 md:py-0 md:pt-2 md:backdrop-blur-none">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 rounded-xl border border-slate-300 py-3.5 text-base font-semibold text-slate-600 transition active:bg-slate-50 md:flex-none md:rounded-lg md:px-4 md:py-2 md:text-sm md:font-medium md:hover:bg-slate-50"
      >
        취소
      </button>
      <button
        type="submit"
        disabled={submitting || disabled}
        className="flex-1 rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-60 md:flex-none md:rounded-lg md:px-4 md:py-2 md:text-sm md:font-medium md:hover:bg-indigo-700"
      >
        {submitting ? submittingLabel : submitLabel}
      </button>
    </div>
  )
}

/**
 * [출고일 미정] 토글 — 장기 보관 계약처럼 종료일이 확정되지 않은 건을 표현한다.
 *
 * 체크하면 출고 예정일 입력창이 비워지고 잠긴다. 날짜를 지우는 것과 체크박스를
 * 켜는 것이 같은 뜻이 되도록(양방향 일치) 상위에서 상태를 하나로 묶어 쓴다.
 * 터치 타깃을 라벨 전체로 넓혀(44px 이상) 작은 네모를 정확히 찍지 않아도 켜진다.
 */
export function UndecidedToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-1.5 flex min-h-[44px] cursor-pointer select-none items-center gap-2 md:min-h-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 md:h-4 md:w-4"
      />
      <span className={cn('text-base font-medium md:text-sm', checked ? 'text-indigo-700' : 'text-slate-500')}>
        출고일 미정 (장기 보관)
      </span>
    </label>
  )
}
