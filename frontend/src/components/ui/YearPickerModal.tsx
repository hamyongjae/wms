import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import Modal from './Modal'

/**
 * [연도 빠른 선택] 월 이동 화살표만 있으면 몇 년 전/후 달로 가려면 수십 번 눌러야 한다.
 * 화면의 "YYYY년 MM월" 라벨을 탭하면 이 모달이 뜨고, 12년 단위 그리드에서 한 번에 연도를
 * 골라 그 해의 같은 달로 바로 이동한다.
 */
export default function YearPickerModal({
  open,
  onClose,
  year,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  /** 모달을 열 당시의 연도 — 그리드 중앙 근처에 오도록 시작점을 잡는 기준 */
  year: number
  onSelect: (year: number) => void
}) {
  const [gridStart, setGridStart] = useState(year - 5)

  // 열릴 때마다 방금 보고 있던 연도가 그리드 중앙쯤 오도록 재정렬
  useEffect(() => {
    if (open) setGridStart(year - 5)
  }, [open, year])

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="연도 선택">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setGridStart((s) => s - 12)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            title="이전 12년"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-bold text-slate-800">
            {gridStart} - {gridStart + 11}
          </span>
          <button
            type="button"
            onClick={() => setGridStart((s) => s + 12)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            title="다음 12년"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => {
            const y = gridStart + i
            const selected = y === year
            const isThisYear = y === new Date().getFullYear()
            return (
              <button
                key={y}
                type="button"
                onClick={() => onSelect(y)}
                className={cn(
                  'flex h-12 items-center justify-center rounded-xl text-base font-semibold transition active:scale-95',
                  selected
                    ? 'bg-indigo-600 text-white'
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
      </div>
    </Modal>
  )
}
