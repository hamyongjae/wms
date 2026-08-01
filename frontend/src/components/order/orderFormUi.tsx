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
 * 기준은 앞서 최적화를 마친 '계약 등록' 화면의 콤팩트 2열 규격이다.
 */

/** 전체 폭(단일 컬럼) 입력 박스 — 창고 선택·메모처럼 넓게 쓰는 필드 */
export const inputCls =
  'w-full rounded-lg border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 md:px-3 md:py-2 md:text-sm'

/**
 * [2열 콤팩트 폼 전용] 계약 등록/수정 팝업의 가로 2열 구간(날짜·보관료·결제 등) 규격.
 *   좁은 반쪽 폭에서 겹침·넘침이 없도록 높이(h-11)·테두리·곡률·여백을 모든 박스에 동일하게 고정한다.
 * min-w-0: 그리드 트랙은 minmax(0,1fr)라 넓어지지 않지만, 그리드 "아이템" 자체는 기본값이
 *   min-width:auto(콘텐츠 기준)라 셀 안의 네이티브 date input·긴 텍스트가 트랙 폭을 무시하고
 *   오른쪽으로 삐져나간다. 셀 div와 그 안의 입력 요소 모두에 min-w-0을 명시해야 실제로 줄어든다.
 */
export const gridCellCls = 'min-w-0'
export const gridInputCls =
  'h-11 w-full min-w-0 rounded-lg border border-slate-300 px-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
/** 계산 결과(보관일수·하루 보관료) — 규격은 입력 박스와 동일하되 강조색으로 '살아있는 값'임을 표시 */
export const gridReadonlyCls =
  'flex h-11 min-w-0 items-center justify-end rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-sm font-semibold text-indigo-600'
/**
 * 수정 불가한 고정 정보(예: 채번된 컨테이너 번호) — 높이·곡률은 입력 박스와 같아
 * 격자 정렬이 흐트러지지 않지만, 진한 회색 배경으로 "만질 수 없는 값"임을 구분한다.
 * div 라서 탭해도 키보드가 뜨지 않는다(오터치 원천 차단).
 */
export const gridLockedCls =
  'flex h-11 min-w-0 items-center rounded-lg border border-slate-200 bg-slate-100 px-2.5 text-sm font-semibold text-slate-500'
export const gridLabelCls = 'mb-1 block truncate text-sm font-semibold text-slate-700'
/** 전체 폭 라벨 (단일 컬럼 필드용) */
export const labelCls = 'mb-1.5 block text-base font-semibold text-slate-700 md:text-sm md:font-medium'

/** 2열 격자 컨테이너 — 등록·수정이 같은 간격(gap-2.5)을 공유한다 */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2.5', className)}>{children}</div>
}

/** 2열 격자 안의 한 칸 — 라벨 + 입력 요소 + (선택) 보조 설명 */
export function GridField({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <div className={gridCellCls}>
      <label className={gridLabelCls}>
        {label}
        {required && ' *'}
      </label>
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
 *
 * 체크박스 줄 전체가 터치 레이어(h-11)라 글자 어디를 눌러도 토글되고,
 * 다른 입력 박스와 같은 높이라 2열 격자의 정렬이 깨지지 않는다.
 */
export function UndecidedToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mb-1.5 flex h-11 w-full min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold text-slate-600 transition active:bg-slate-100">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span className="min-w-0 flex-1 truncate">출고일 미정</span>
    </label>
  )
}

/** '출고일 미정'이 켜졌을 때 날짜 입력창 자리를 대신하는 톤다운 표시 */
export function UndecidedPlaceholder() {
  return (
    <div className="flex h-11 min-w-0 items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold leading-tight text-slate-400">
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
