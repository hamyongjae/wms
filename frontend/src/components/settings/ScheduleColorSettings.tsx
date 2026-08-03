import { useState } from 'react'
import { CalendarDays, Check, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { cn } from '@/lib/cn'
import {
  SCHEDULE_CATEGORY_ORDER,
  SCHEDULE_META,
  scheduleBadgeStyle,
  type ScheduleCategory,
} from '@/lib/orderSchedule'
import {
  applyScheduleColors,
  DEFAULT_SCHEDULE_COLORS,
  deriveColor,
  getScheduleColors,
  paintScheduleColors,
  SCHEDULE_PALETTE,
} from '@/lib/scheduleColors'

/**
 * ===== [달력 상태 색상 설정] =====
 *
 * 대시보드 미니달력·입출고 일정 화면의 5개 상태색을 사용자가 직접 고른다.
 *
 * 조작 흐름은 두 번의 탭으로 끝난다.
 *   1) 위쪽에서 바꿀 상태를 고른다 (입고예정·입고·출고일미정·출고예정·출고)
 *   2) 아래 팔레트에서 색을 고른다 → 그 자리에서 바로 화면 전체가 그 색으로 바뀐다
 *
 * 미리보기는 CSS 변수만 갈아끼우고 저장은 하지 않는다. 그래서 [취소]를 누르면
 * 원래 색이 즉시 되돌아온다 — 마음껏 눌러봐도 되는 안전한 상태를 만드는 게 목적이다.
 */
export default function ScheduleColorSettings() {
  const [open, setOpen] = useState(false)
  // 저장된 색 (닫혀 있을 때 카드 미리보기에 쓰는 값)
  const [saved, setSaved] = useState(() => getScheduleColors())
  // 편집 중인 색 (모달 안에서만 유효)
  const [draft, setDraft] = useState(saved)
  const [editing, setEditing] = useState<ScheduleCategory>('IN_PENDING')

  function openModal() {
    const current = getScheduleColors()
    setSaved(current)
    setDraft(current)
    setEditing('IN_PENDING')
    setOpen(true)
  }

  /** 팔레트에서 색을 고르면 즉시 화면에 반영한다(저장 전 미리보기) */
  function pick(color: string) {
    const next = { ...draft, [editing]: color }
    setDraft(next)
    paintScheduleColors(next)
  }

  function handleReset() {
    setDraft(DEFAULT_SCHEDULE_COLORS)
    paintScheduleColors(DEFAULT_SCHEDULE_COLORS)
  }

  function handleSave() {
    applyScheduleColors(draft)
    setSaved(draft)
    setOpen(false)
  }

  /** 취소 — 미리보기로 바꿔둔 색을 저장된 값으로 되돌린다 */
  function handleCancel() {
    paintScheduleColors(saved)
    setOpen(false)
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <CalendarDays size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">달력 상태 색상</p>
          <p className="text-xs text-slate-400">입고·출고 상태별 색을 바꿉니다. (이 기기에만 저장)</p>
        </div>
      </div>

      {/* 현재 색 미리보기 — 실제 달력에 쓰이는 배지 모양 그대로 보여준다 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {SCHEDULE_CATEGORY_ORDER.map((cat) => (
          <span key={cat} className="rounded-md px-2.5 py-1.5 text-xs font-bold" style={scheduleBadgeStyle(cat)}>
            {SCHEDULE_META[cat].label}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={openModal}
        className="mt-4 w-full rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-700 transition active:scale-[0.99] hover:bg-slate-50 sm:w-auto sm:px-5"
      >
        색상 바꾸기
      </button>

      <Modal
        open={open}
        onClose={handleCancel}
        title="달력 상태 색상"
        widthClass="max-w-2xl"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-3.5 text-sm font-semibold text-slate-600 transition active:bg-slate-50 md:rounded-lg md:py-2"
            >
              <RotateCcw size={15} /> 기본값
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-slate-300 px-4 py-3.5 text-base font-semibold text-slate-600 transition active:bg-slate-50 md:rounded-lg md:py-2 md:text-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-indigo-600 px-5 py-3.5 text-base font-bold text-white transition active:scale-[0.99] md:rounded-lg md:py-2 md:text-sm md:font-medium"
            >
              저장
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* 1단계 — 바꿀 상태 고르기. 각 칩이 자기 색으로 칠해져 있어 지금 무슨 색인지 바로 보인다 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">1. 바꿀 상태를 고르세요</p>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_CATEGORY_ORDER.map((cat) => {
                const active = cat === editing
                const d = deriveColor(draft[cat])
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEditing(cat)}
                    aria-pressed={active}
                    className={cn(
                      'flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-bold transition',
                      active ? 'border-slate-800' : 'border-transparent hover:bg-slate-50',
                    )}
                    style={{ backgroundColor: d.bg, color: d.fg }}
                  >
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: d.fg }} />
                    {SCHEDULE_META[cat].label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2단계 — 팔레트. 세로 한 줄이 같은 계열, 아래로 갈수록 옅어진다 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              2. <span className="text-indigo-600">{SCHEDULE_META[editing].label}</span> 에 쓸 색을 고르세요
            </p>
            <div className="flex gap-2 sm:gap-3">
              {SCHEDULE_PALETTE.map((column, ci) => (
                <div key={ci} className="flex flex-1 flex-col gap-2 sm:gap-3">
                  {column.map((color) => {
                    const selected = draft[editing].toLowerCase() === color.toLowerCase()
                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => pick(color)}
                        aria-label={color}
                        aria-pressed={selected}
                        className={cn(
                          'flex h-11 w-full items-center justify-center rounded-lg ring-1 ring-black/10 transition active:scale-95',
                          selected && 'ring-2 ring-slate-900 ring-offset-2',
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {selected && <Check size={18} className="text-white" strokeWidth={3} />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* 3단계 — 실제 달력에서 어떻게 보이는지. 저장 전에 결과를 확인할 수 있어야 되돌리는 일이 줄어든다 */}
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-xs font-semibold text-slate-500">달력에서 이렇게 보입니다</p>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_CATEGORY_ORDER.map((cat) => {
                const d = deriveColor(draft[cat])
                return (
                  <span
                    key={cat}
                    className="rounded-md px-2.5 py-1.5 text-xs font-bold"
                    style={{ backgroundColor: d.bg, color: d.fg, boxShadow: `0 0 0 1px ${d.ring}` }}
                  >
                    {SCHEDULE_META[cat].label}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
