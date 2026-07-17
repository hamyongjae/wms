import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import {
  Grid3x3,
  Boxes,
  Square,
  Percent,
  Loader2,
  Plus,
  Warehouse as WarehouseIcon,
} from 'lucide-react'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { yardApi, type WarehouseOccupancy, type YardSlot } from '@/api/yardApi'
import StatCard from '@/components/ui/StatCard'
import Modal from '@/components/ui/Modal'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

export default function YardPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [occupancy, setOccupancy] = useState<WarehouseOccupancy | null>(null)
  const [slots, setSlots] = useState<YardSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // 창고 목록 로드 → 첫 창고 선택
  useEffect(() => {
    warehouseApi
      .list()
      .then((list) => {
        setWarehouses(list)
        setSelectedId(list[0]?.id ?? null)
      })
      .catch(() => setError('창고 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  // 선택 창고의 점유 요약 + 슬롯 로드
  useEffect(() => {
    if (selectedId == null) return
    setLoading(true)
    setError(null)
    Promise.all([yardApi.warehouseOccupancy(selectedId), yardApi.slots(selectedId)])
      .then(([occ, sl]) => {
        setOccupancy(occ)
        setSlots(sl)
      })
      .catch(() => setError('야적장 현황을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [selectedId, refreshKey])

  const blocks = useMemo(() => groupByBlock(slots), [slots])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">야적장 상황판</h2>
          <p className="mt-1 text-sm text-slate-500">구역별 컨테이너 적재 현황과 공실률을 한눈에 봅니다.</p>
        </div>
        {isAdmin && selectedId != null && (
          <GridGenerator warehouseId={selectedId} onDone={() => setRefreshKey((k) => k + 1)} />
        )}
      </div>

      {/* 창고 선택 탭 */}
      {warehouses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setSelectedId(w.id)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition',
                w.id === selectedId
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && warehouses.length === 0 && (
        <EmptyState title="등록된 창고가 없습니다" desc="창고 관리에서 창고를 먼저 등록하세요." />
      )}

      {!loading && !error && occupancy && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="총 슬롯" value={fmt(occupancy.totalSlots)} icon={Grid3x3} tone="slate" />
            <StatCard label="사용중" value={fmt(occupancy.occupiedSlots)} icon={Boxes} tone="indigo" />
            <StatCard label="공실" value={fmt(occupancy.availableSlots)} icon={Square} tone="emerald" />
            <StatCard
              label="공실률"
              value={`${occupancy.vacancyRate}%`}
              sub={`사용률 ${occupancy.occupancyRate}%`}
              icon={Percent}
              tone="amber"
            />
          </div>

          {occupancy.totalSlots === 0 ? (
            <EmptyState
              title="이 창고에 슬롯이 없습니다"
              desc={isAdmin ? '우측 상단 "구역 생성"으로 격자를 만드세요.' : '관리자가 격자를 생성하면 표시됩니다.'}
            />
          ) : (
            <>
              {occupancy.blocks && occupancy.blocks.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-700">구역별 점유율</h3>
                  <div className="mt-4 space-y-3">
                    {occupancy.blocks.map((b) => (
                      <div key={b.block} className="flex items-center gap-3">
                        <span className="w-10 shrink-0 text-sm font-medium text-slate-600">{b.block}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${b.occupancyRate}%` }}
                          />
                        </div>
                        <span className="w-28 shrink-0 text-right text-xs text-slate-400">
                          {b.occupiedSlots}/{b.totalSlots} · {b.occupancyRate}%
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">적재 현황</h3>
                  <Legend />
                </div>

                <div className="mt-5 space-y-6">
                  {blocks.map(({ block, bays }) => (
                    <div key={block}>
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                        <WarehouseIcon size={15} className="text-slate-400" />
                        {block} 구역
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {bays.map((bay) => (
                          <div key={bay.key} className="flex flex-col items-center gap-1">
                            <div className="flex flex-col gap-1">
                              {bay.tiers.map((s) => (
                                <div
                                  key={s.id}
                                  title={`${s.locationLabel}${s.containerNo ? ` · ${s.containerNo}` : ''}`}
                                  className={cn(
                                    'flex h-8 w-11 items-center justify-center rounded-md text-[11px] font-medium transition',
                                    s.occupied
                                      ? 'bg-indigo-500 text-white shadow-sm'
                                      : 'border border-dashed border-slate-300 text-slate-300',
                                  )}
                                >
                                  {s.occupied ? (s.containerNo ?? `${s.tier}층`) : `${s.tier}층`}
                                </div>
                              ))}
                            </div>
                            <span className="text-[11px] text-slate-400">
                              가로{bay.row}·세로{bay.col}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}

/* ===== 구역(격자) 생성 ===== */
function GridGenerator({ warehouseId, onDone }: { warehouseId: number; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [block, setBlock] = useState('A')
  const [rows, setRows] = useState('3')
  const [columns, setColumns] = useState('3')
  const [tiers, setTiers] = useState('3')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const total = (Number(rows) || 0) * (Number(columns) || 0) * (Number(tiers) || 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await yardApi.generateGrid({
        warehouseId,
        block,
        rows: Number(rows),
        columns: Number(columns),
        tiers: Number(tiers),
      })
      setOpen(false)
      onDone()
    } catch (err) {
      setFormError(
        isAxiosError(err) ? (err.response?.data?.message ?? '생성에 실패했습니다.') : '생성에 실패했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        <Plus size={16} />
        구역 생성
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="야적장 구역(격자) 생성">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">구역(Block)</label>
            <input value={block} onChange={(e) => setBlock(e.target.value)} required className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">가로</label>
              <input type="number" min={1} value={rows} onChange={(e) => setRows(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">세로</label>
              <input type="number" min={1} value={columns} onChange={(e) => setColumns(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">층</label>
              <input type="number" min={1} value={tiers} onChange={(e) => setTiers(e.target.value)} className={inputCls} />
            </div>
          </div>

          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            총 <span className="font-semibold text-slate-700">{total}</span>칸이 생성됩니다. (이미 있는 좌표는 건너뜁니다)
          </p>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? '생성 중…' : '생성'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/* ===== 유틸 ===== */
function fmt(n: number): string {
  return n.toLocaleString('ko-KR')
}

interface Bay {
  key: string
  row: number
  col: number
  tiers: YardSlot[]
}

function groupByBlock(slots: YardSlot[]): Array<{ block: string; bays: Bay[] }> {
  const blockMap = new Map<string, YardSlot[]>()
  for (const s of slots) {
    if (!blockMap.has(s.block)) blockMap.set(s.block, [])
    blockMap.get(s.block)!.push(s)
  }

  return [...blockMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([block, blockSlots]) => {
      const bayMap = new Map<string, YardSlot[]>()
      for (const s of blockSlots) {
        const key = `${s.rowNo}|${s.columnNo}`
        if (!bayMap.has(key)) bayMap.set(key, [])
        bayMap.get(key)!.push(s)
      }
      const bays: Bay[] = [...bayMap.entries()]
        .map(([key, arr]) => ({
          key,
          row: arr[0].rowNo,
          col: arr[0].columnNo,
          tiers: [...arr].sort((x, y) => y.tier - x.tier),
        }))
        .sort((a, b) => a.row - b.row || a.col - b.col)
      return { block, bays }
    })
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-indigo-500" /> 사용중
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-dashed border-slate-300" /> 공실
      </span>
    </div>
  )
}

function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
      <p className="text-base font-semibold text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-400">{desc}</p>
    </div>
  )
}
