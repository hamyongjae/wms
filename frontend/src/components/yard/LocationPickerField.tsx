import { useEffect, useMemo, useState } from 'react'
import { Loader2, MapPin, Check, X } from 'lucide-react'
import { yardApi, type YardSlot } from '@/api/yardApi'
import { cn } from '@/lib/cn'

/**
 * 계약 등록·수정 팝업 공용 "컨테이너 위치 지정" 필드.
 * - 창고 슬롯을 구역(block)별 격자 맵으로 그려 빈칸을 터치해 선택
 * - value(선택 슬롯 id) 단일 선택. null = 미지정
 * - currentSlotId: 수정 모드에서 이 계약이 현재 쓰는 자리(강조 + 선택 가능)
 * - disabled: 읽기 전용(출고완료 등 잠금 계약)
 * - 미사용(운영 중지) 자리는 컨테이너 관리 격자와 동일하게 'X' 오버레이로 표시하고 선택 불가로 막는다
 *   (예전엔 빈자리와 구분 없이 선택돼, 제출 시점에야 "미사용 자리에는 입고할 수 없습니다" 에러가 났다).
 */
export default function LocationPickerField({
  warehouseId,
  value,
  onChange,
  onPickSlot,
  currentSlotId = null,
  disabled = false,
}: {
  warehouseId: number | null
  value: number | null
  onChange: (slotId: number | null) => void
  onPickSlot?: (slot: YardSlot | null) => void // 선택된 슬롯 전체(층 단가 연동용)
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

  // [미사용 제외] 실제로 배치 가능한 빈자리만 센다 — 운영 중지 자리는 빈자리이긴 해도 고를 수 없다.
  const emptyCount = useMemo(
    () => slots.filter((s) => !s.occupied && s.active !== false).length,
    [slots],
  )
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
              if (e.target.checked) {
                onChange(null) // 체크 시 미지정. 해제는 슬롯을 눌러서.
                onPickSlot?.(null)
              }
            }}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          위치 미지정(추후 지정)
        </label>
      </div>

      {/* (b) 격자 맵 */}
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
                <p className="mb-1.5 inline-flex items-center gap-1.5 rounded bg-indigo-600 px-2 py-1 text-xs font-bold text-white shadow-sm">
                  {tier}층 <span className="font-medium text-indigo-100">· {cells.length}칸</span>
                </p>
                <div className="grid grid-cols-5 justify-items-center gap-1.5">
                  {cells.map((s) => {
                    const isSelected = s.id === value
                    const isCurrent = s.id === currentSlotId
                    // [미사용] 운영 중지 자리는 비어 있어도 고를 수 없다 — 컨테이너 관리 격자와 동일 규칙.
                    const isInactive = !s.occupied && s.active === false && !isCurrent
                    const selectable = !disabled && !isInactive && (!s.occupied || isCurrent)
                    // 사용중(남의 자리) 칸은 칸 안에 화주명까지 보여준다 — 굳이 하나씩 눌러보거나
                    // 마우스를 올려보지 않아도 누구 자리인지 한눈에 보이도록.
                    const showOwner = s.occupied && !isCurrent && s.ownerName
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!selectable}
                        onClick={() => {
                          const next = isSelected ? null : s
                          onChange(next ? next.id : null)
                          onPickSlot?.(next)
                        }}
                        title={
                          isInactive
                            ? `${s.locationLabel} · 미사용(운영 중지)`
                            : s.occupied && !isCurrent
                              ? `사용중 (${s.containerNo ?? '점유'}${s.ownerName ? ` · ${s.ownerName}` : ''})`
                              : `빈자리 (${s.locationLabel})`
                        }
                        className={cn(
                          'relative flex h-14 w-14 flex-col items-center justify-center rounded-lg border-2 tabular-nums transition',
                          isSelected
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                            : isCurrent
                              ? 'border-dashed border-indigo-500 bg-indigo-50 text-indigo-700'
                              : s.occupied
                                ? 'cursor-not-allowed border-indigo-900 bg-indigo-900 text-white shadow-inner'
                                : isInactive
                                  ? 'cursor-not-allowed border-slate-400 bg-slate-200 text-slate-500'
                                  : 'border-dashed border-emerald-500 bg-emerald-50 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-100',
                        )}
                      >
                        {isSelected ? (
                          <Check size={20} strokeWidth={3} />
                        ) : (
                          <span className={cn('font-extrabold', showOwner ? 'text-sm leading-tight' : 'text-base')}>
                            {s.columnNo}
                          </span>
                        )}
                        {showOwner && (
                          <span className="max-w-full truncate px-0.5 text-[10px] font-semibold leading-tight text-indigo-100">
                            {s.ownerName}
                          </span>
                        )}
                        {isCurrent && !isSelected && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-indigo-500 px-1 text-[9px] font-bold leading-tight text-white">
                            현재
                          </span>
                        )}
                        {/* 미사용 지정 — 블록 전체를 덮는 X 레이어 (컨테이너 관리 격자와 동일) */}
                        {isInactive && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-600/70">
                            <X size={16} strokeWidth={3} className="text-white" />
                          </div>
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
      <div className="flex flex-wrap items-center gap-4 border-t border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded border-2 border-dashed border-emerald-500 bg-emerald-50" /> 빈자리
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded border-2 border-indigo-900 bg-indigo-900" /> 사용중
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded border-2 border-slate-400 bg-slate-200" /> 미사용
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 rounded bg-indigo-600" /> 선택
        </span>
        {warehouseId != null && !loading && (
          <span className="ml-auto text-sm font-bold text-emerald-700">빈자리 {emptyCount}칸</span>
        )}
      </div>
    </div>
  )
}
