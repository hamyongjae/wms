import { useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, Check } from 'lucide-react'
import { yardApi, type YardSlot } from '@/api/yardApi'
import { cn } from '@/lib/cn'

/**
 * 계약 등록·수정 팝업 공용 "컨테이너 위치 지정" 필드.
 * - 창고 슬롯을 구역(block)별 격자 맵으로 그려 빈칸을 터치해 선택
 * - value(선택 슬롯 id) 단일 선택. null = 미지정
 * - currentSlotId: 수정 모드에서 이 계약이 현재 쓰는 자리(강조 + 선택 가능)
 * - disabled: 읽기 전용(출고완료 등 잠금 계약)
 */
export default function LocationPickerField({
  warehouseId,
  value,
  onChange,
  currentSlotId = null,
  disabled = false,
}: {
  warehouseId: number | null
  value: number | null
  onChange: (slotId: number | null) => void
  currentSlotId?: number | null
  disabled?: boolean
}) {
  const [slots, setSlots] = useState<YardSlot[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (warehouseId == null) {
      setSlots([])
      return
    }
    let alive = true
    setLoading(true)
    yardApi
      .slots(warehouseId)
      .then((s) => alive && setSlots(s))
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [warehouseId])

  // 층(tier)별로 묶어 높은 층이 위로 오게 정렬. 각 층은 자리 번호(columnNo) 오름차순.
  const floors = useMemo(() => {
    const map = new Map<number, YardSlot[]>()
    for (const s of slots) {
      if (!map.has(s.tier)) map.set(s.tier, [])
      map.get(s.tier)!.push(s)
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0]) // 3층 → 1층
      .map(([tier, list]) => ({
        tier,
        cells: [...list].sort((x, y) => x.columnNo - y.columnNo),
      }))
  }, [slots])

  const emptyCount = useMemo(() => slots.filter((s) => !s.occupied).length, [slots])
  const selectedLabel = useMemo(
    () => slots.find((s) => s.id === value)?.locationLabel ?? null,
    [slots, value],
  )

  const isUnassigned = value == null

  return (
    <div className="rounded-xl border border-slate-200">
      {/* (a) 상태 바 + 미지정 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-1.5 text-sm">
          <MapPin size={15} className={selectedLabel ? 'text-indigo-600' : 'text-slate-400'} />
          {selectedLabel ? (
            <span className="font-semibold text-slate-800">{selectedLabel}</span>
          ) : (
            <span className="text-slate-400">위치 미지정</span>
          )}
        </div>
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={isUnassigned}
            disabled={disabled}
            onChange={(e) => {
              if (e.target.checked) onChange(null) // 체크 시 미지정. 해제는 슬롯을 눌러서.
            }}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          위치 미지정 (추후 지정)
        </label>
      </div>

      {/* (c) 격자 맵 */}
      <div className={cn('max-h-52 overflow-y-auto p-3', isUnassigned && !disabled && 'opacity-70')}>
        {warehouseId == null ? (
          <p className="py-6 text-center text-xs text-slate-400">먼저 창고를 선택하세요.</p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
            <Loader2 size={15} className="animate-spin" />
            <span className="text-xs">배치도 불러오는 중…</span>
          </div>
        ) : slots.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            이 창고에 구역/자리가 없습니다. 미지정으로 등록하거나 창고에서 구역을 먼저 생성하세요.
          </p>
        ) : (
          <div className="space-y-4">
            {floors.map(({ tier, cells }) => (
              <div key={tier}>
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
                  {tier}층 <span className="text-slate-300">· {cells.length}칸</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cells.map((s) => {
                    const isSelected = s.id === value
                    const isCurrent = s.id === currentSlotId
                    const selectable = !disabled && (!s.occupied || isCurrent)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!selectable}
                        onClick={() => onChange(isSelected ? null : s.id)}
                        title={s.occupied && !isCurrent ? `사용중 (${s.containerNo ?? '점유'})` : s.locationLabel}
                        className={cn(
                          'relative flex h-10 w-10 items-center justify-center rounded-lg border text-[11px] font-medium transition',
                          isSelected
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow'
                            : isCurrent
                              ? 'border-dashed border-indigo-400 bg-indigo-50 text-indigo-700'
                              : s.occupied
                                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                : 'border-dashed border-slate-300 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50',
                        )}
                      >
                        {isSelected ? <Check size={14} /> : s.columnNo}
                        {isCurrent && !isSelected && (
                          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-indigo-500 px-1 text-[8px] leading-tight text-white">
                            현재
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-dashed border-slate-300" /> 빈자리
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-slate-100" /> 사용중
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-indigo-600" /> 선택
        </span>
        {warehouseId != null && !loading && <span className="ml-auto">빈자리 {emptyCount}칸</span>}
      </div>
    </div>
  )
}
