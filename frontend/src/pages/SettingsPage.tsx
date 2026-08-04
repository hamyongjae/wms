import { useState } from 'react'
import { Palette, Check, RotateCcw } from 'lucide-react'
import { THEMES, getTheme, applyTheme, previewTheme, DEFAULT_THEME, type ThemeId } from '@/lib/theme'
import { cn } from '@/lib/cn'
import ScheduleColorSettings from '@/components/settings/ScheduleColorSettings'
import PushNotificationSettings from '@/components/settings/PushNotificationSettings'
import Modal from '@/components/ui/Modal'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">설정</h2>
        <p className="mt-1 text-sm text-slate-500">테마 색상·달력 상태 색상·알림을 관리합니다.</p>
      </div>

      <ThemeSection />

      <ScheduleColorSettings />

      <PushNotificationSettings />
    </div>
  )
}

/**
 * ===== [테마(포인트 컬러) 선택] =====
 * 현재 색 배지를 탭하면 팝업이 뜨는 방식 — 달력 상태 색상 설정과 동일한 조작 흐름.
 * 팝업 안에서 고르는 즉시 화면 전체가 미리 칠해지고(저장 전 미리보기), [저장]을 눌러야
 * localStorage에 반영된다. [취소]하면 원래 색으로 되돌아간다.
 */
function ThemeSection() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<ThemeId>(() => getTheme())
  const [draft, setDraft] = useState<ThemeId>(saved)

  function openModal() {
    const cur = getTheme()
    setSaved(cur)
    setDraft(cur)
    setOpen(true)
  }
  function pick(id: ThemeId) {
    setDraft(id)
    previewTheme(id)
  }
  function handleReset() {
    setDraft(DEFAULT_THEME)
    previewTheme(DEFAULT_THEME)
  }
  function handleSave() {
    applyTheme(draft)
    setSaved(draft)
    setOpen(false)
  }
  function handleCancel() {
    previewTheme(saved)
    setOpen(false)
  }

  const activeMeta = THEMES.find((t) => t.id === saved)

  return (
    <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Palette size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-800">테마 색상</p>
          <p className="text-xs text-slate-400">앱 전체의 포인트 색상을 바꿉니다. (이 기기에만 저장)</p>
        </div>
      </div>

      {/* 현재 테마 미리보기 — 탭하면 색상 선택 팝업이 바로 뜬다 */}
      <button
        type="button"
        onClick={openModal}
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-slate-200 p-3 text-left transition active:scale-[0.99] hover:bg-slate-50 sm:w-auto sm:px-4"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-black/5"
          style={{ backgroundColor: activeMeta?.color }}
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-800">{activeMeta?.label ?? '테마'}</span>
          <span className="block text-xs text-slate-400">눌러서 색 바꾸기</span>
        </span>
      </button>

      <Modal
        open={open}
        onClose={handleCancel}
        title="테마 색상"
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
        {/* [고령 사용자 접근성] 화면 폭에 맞춰 자연스럽게 줄바꿈되는 원형 스와치 칩.
            선택 상태는 스와치 안 체크 아이콘 + 테두리 강조로 이중 표시한다. */}
        <div className="flex flex-wrap justify-center gap-3">
          {THEMES.map((t) => {
            const active = t.id === draft
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                aria-pressed={active}
                className={cn(
                  'flex w-20 flex-col items-center gap-1.5 rounded-2xl border-2 py-3 transition',
                  active ? 'border-slate-800 bg-slate-50' : 'border-transparent hover:bg-slate-50',
                )}
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: t.color }}
                >
                  {active && <Check size={20} className="text-white" strokeWidth={3} />}
                </span>
                <span className="text-xs font-semibold text-slate-700">{t.label}</span>
              </button>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}
