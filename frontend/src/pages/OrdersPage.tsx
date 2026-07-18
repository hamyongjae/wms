import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Plus, Loader2, Trash2, LogOut, FileText, ShieldAlert, AlertTriangle, Pencil, X } from 'lucide-react'
import { orderApi, type StorageOrder, type OrderStatus } from '@/api/orderApi'
import { customerApi, type Customer, type CustomerType } from '@/api/customerApi'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { containerApi } from '@/api/containerApi'
import { yardApi } from '@/api/yardApi'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { validateContractPeriod } from '@/lib/dateValidation'
import { calcDailyFee } from '@/lib/fee'
import { extractOwner } from '@/lib/owner'
import { nextContainerNo } from '@/lib/containerNo'
import Modal from '@/components/ui/Modal'
import MoneyInput from '@/components/ui/MoneyInput'
import CustomerListPicker from '@/components/customer/CustomerListPicker'
import LocationPickerField from '@/components/yard/LocationPickerField'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

const STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  RECEIVED: { label: '입고완료', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  IN_STORAGE: { label: '보관중', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  RELEASED: { label: '출고완료', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
  CANCELLED: { label: '취소', cls: 'bg-red-50 text-red-600 ring-red-200' },
}

type FilterKey = 'ALL' | 'ACTIVE' | 'RELEASED' | 'CANCELLED'
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'ACTIVE', label: '보관중' },
  { key: 'RELEASED', label: '출고완료' },
  { key: 'CANCELLED', label: '취소' },
]

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const isActive = (s: OrderStatus) => s === 'RECEIVED' || s === 'IN_STORAGE'

/**
 * 특정 계약(주문)에 컨테이너를 만들어 지정 슬롯에 적재·배정하는 파이프라인.
 * 컨테이너 생성 → 계약 배정(assign) → 슬롯 적재(inbound). 화주명은 memo 태그로 함께 남긴다.
 */
async function placeContainerAtSlot(
  orderId: number,
  warehouseId: number,
  slotId: number,
  opts: { customerName?: string; inboundDate?: string; outboundDate?: string },
) {
  const existing = await containerApi.list({ warehouseId })
  const no = nextContainerNo(new Set(existing.map((c) => c.containerNo)))
  const memo = opts.customerName ? `[${opts.customerName}]` : undefined
  const created = await containerApi.create({
    warehouseId,
    containerNo: no,
    memo,
    inboundDate: opts.inboundDate,
    expectedOutboundDate: opts.outboundDate,
  })
  await containerApi.assign(created.id, orderId)
  await containerApi.inbound({ containerId: created.id, targetSlotId: slotId })
}

export default function OrdersPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StorageOrder | null>(null)
  const [releaseTarget, setReleaseTarget] = useState<StorageOrder | null>(null)
  // 계약 id → 배치된 슬롯 위치 라벨 목록 (창고+화주 기준으로 조인)
  const [locationsByOrder, setLocationsByOrder] = useState<Map<number, string[]>>(new Map())

  const reload = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([orderApi.list(), customerApi.list(), warehouseApi.list()])
      .then(([o, c, w]) => {
        setOrders(o)
        setCustomers(c)
        setWarehouses(w)
        void loadPlacements(o)
      })
      .catch(() => setError('계약 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [refreshKey])

  /**
   * 계약별 배치 위치 계산 (부가 정보 — 실패해도 목록은 정상 표시).
   * 이 앱은 계약↔컨테이너 직접 링크가 없으므로, 계약의 '창고 + 고객(화주)'과
   * 슬롯에 적재된 컨테이너의 '창고 + memo 화주 태그'를 매칭해 위치 라벨을 모은다.
   */
  async function loadPlacements(orderList: StorageOrder[]) {
    try {
      const whIds = [...new Set(orderList.map((o) => o.warehouseId))]
      if (whIds.length === 0) {
        setLocationsByOrder(new Map())
        return
      }
      const [containers, ...slotLists] = await Promise.all([
        containerApi.list({}),
        ...whIds.map((id) => yardApi.slots(id)),
      ])

      // 적재된 슬롯: containerId → 위치 라벨
      const locByContainer = new Map<number, string>()
      for (const s of slotLists.flat()) {
        if (s.occupied && s.containerId != null) locByContainer.set(s.containerId, s.locationLabel)
      }

      const map = new Map<number, string[]>() // orderId → 위치 라벨[] (정식 배정 우선)
      const key = (wid: number, owner: string) => `${wid}|${owner}`
      const byKey = new Map<string, string[]>() // (창고+화주) → 위치[] (배정 없는 컨테이너 폴백용)

      for (const ct of containers) {
        const loc = locByContainer.get(ct.id)
        if (!loc) continue
        if (ct.currentOrderId != null) {
          // [정식 배정] 컨테이너가 계약에 직접 연결된 경우 — 정확한 매칭
          const arr = map.get(ct.currentOrderId) ?? []
          arr.push(loc)
          map.set(ct.currentOrderId, arr)
        } else {
          // 배정 안 된 컨테이너는 창고+화주명 매칭으로 폴백
          const owner = extractOwner(ct.memo)
          if (!owner) continue
          const k = key(ct.warehouseId, owner)
          const arr = byKey.get(k) ?? []
          arr.push(loc)
          byKey.set(k, arr)
        }
      }

      // 정식 배정된 위치가 하나도 없는 계약만 화주명 매칭으로 보완
      for (const o of orderList) {
        if (!map.has(o.id)) {
          const nm = byKey.get(key(o.warehouseId, o.customerName))
          if (nm) map.set(o.id, nm)
        }
      }
      setLocationsByOrder(map)
    } catch {
      setLocationsByOrder(new Map()) // 위치는 부가 정보이므로 조용히 생략
    }
  }

  const visible = useMemo(() => {
    if (filter === 'ALL') return orders
    if (filter === 'ACTIVE') return orders.filter((o) => isActive(o.status))
    return orders.filter((o) => o.status === filter)
  }, [orders, filter])

  async function handleDelete(o: StorageOrder) {
    if (!window.confirm(`'${o.customerName}' 계약을 삭제할까요?`)) return
    try {
      await orderApi.remove(o.id)
      reload()
    } catch (err) {
      alert(errMsg(err, '삭제에 실패했습니다.'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">계약 관리</h2>
          <p className="mt-1 text-sm text-slate-500">보관 계약을 등록하고 입고·출고 일정을 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus size={16} />
          계약 등록
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const count =
            f.key === 'ALL'
              ? orders.length
              : f.key === 'ACTIVE'
                ? orders.filter((o) => isActive(o.status)).length
                : orders.filter((o) => o.status === f.key).length
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                filter === f.key
                  ? 'bg-slate-800 text-white'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.label} <span className="ml-0.5 opacity-70">{count}</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <FileText size={22} />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-700">계약이 없습니다</p>
          <p className="mt-1 text-sm text-slate-400">"계약 등록"으로 첫 보관 계약을 추가하세요.</p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">고객</th>
                <th className="px-5 py-3 font-medium">창고</th>
                <th className="px-5 py-3 font-medium">위치</th>
                <th className="px-5 py-3 font-medium">보관기간</th>
                <th className="px-5 py-3 text-right font-medium">보관료</th>
                <th className="px-5 py-3 font-medium">상태</th>
                <th className="px-5 py-3 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((o) => (
                <tr key={o.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{o.customerName}</td>
                  <td className="px-5 py-3 text-slate-500">{o.warehouseName}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {(() => {
                      const locs = locationsByOrder.get(o.id) ?? []
                      if (locs.length === 0) return <span className="text-slate-300">미배치</span>
                      return (
                        <span title={locs.join(', ')} className="inline-flex items-center gap-1">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                            {locs[0]}
                          </span>
                          {locs.length > 1 && <span className="text-xs text-slate-400">외 {locs.length - 1}</span>}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {o.storageStartDate}
                    <span className="text-slate-300"> ~ </span>
                    {o.actualEndDate ?? o.expectedEndDate ?? '미정'}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700">{won(o.monthlyFee)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                        STATUS_META[o.status].cls,
                      )}
                    >
                      {STATUS_META[o.status].label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isActive(o.status) && (
                        <>
                          <button
                            type="button"
                            onClick={() => setReleaseTarget(o)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-amber-600 transition hover:bg-amber-50"
                          >
                            <LogOut size={14} />
                            출고 처리
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditTarget(o)}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                          >
                            <Pencil size={14} />
                          </button>

                        </>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(o)}
                          title="삭제"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateOrderModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        customers={customers}
        warehouses={warehouses}
        onCustomerAdded={(c) => setCustomers((prev) => [c, ...prev])}
        onDone={() => {
          setCreateOpen(false)
          reload()
        }}
      />

      <EditOrderModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onDone={() => {
          setEditTarget(null)
          reload()
        }}
      />

      <ReleaseModal
        target={releaseTarget}
        onClose={() => setReleaseTarget(null)}
        onDone={() => {
          setReleaseTarget(null)
          reload()
        }}
      />
    </div>
  )
}

/* ===== 계약 수정 (출고예정일·월보관료·총부피·메모) ===== */
function EditOrderModal({
  target,
  onClose,
  onDone,
}: {
  target: StorageOrder | null
  onClose: () => void
  onDone: () => void
}) {
  const [storageStartDate, setStartDate] = useState('')
  const [expectedEndDate, setEndDate] = useState('')
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [totalVolume, setVolume] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // 위치: 선택 슬롯 / 현재(원래) 슬롯·컨테이너
  const [slotId, setSlotId] = useState<number | null>(null)
  const [currentSlotId, setCurrentSlotId] = useState<number | null>(null)
  const [currentContainerId, setCurrentContainerId] = useState<number | null>(null)

  useEffect(() => {
    if (target) {
      setStartDate(target.storageStartDate ?? '')
      setEndDate(target.expectedEndDate ?? '')
      setMonthlyFee(target.monthlyFee)
      setVolume(target.totalVolume != null ? String(target.totalVolume) : '')
      setMemo(target.memo ?? '')
      setFormError(null)
    }
  }, [target])

  // 이 계약에 배정·적재된 컨테이너의 현재 자리를 조회 (수정 모드 강조/이동 기준)
  useEffect(() => {
    if (!target) return
    let alive = true
    setSlotId(null)
    setCurrentSlotId(null)
    setCurrentContainerId(null)
    Promise.all([containerApi.list({ warehouseId: target.warehouseId }), yardApi.slots(target.warehouseId)])
      .then(([containers, slots]) => {
        if (!alive) return
        const ct = containers.find((c) => c.currentOrderId === target.id)
        if (!ct) return
        setCurrentContainerId(ct.id)
        const slot = slots.find((s) => s.containerId === ct.id)
        if (slot) {
          setCurrentSlotId(slot.id)
          setSlotId(slot.id)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [target])

  if (!target) return null

  // [정합성] 보관 시작일이 계약 종료일보다 미래가 될 수 없다 (당일 허용)
  const periodError = validateContractPeriod(storageStartDate, expectedEndDate)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (periodError) {
      setFormError(periodError)
      return
    }
    if (monthlyFee == null || monthlyFee <= 0) {
      setFormError('월 보관료를 입력하세요.')
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      await orderApi.update(target!.id, {
        storageStartDate: storageStartDate || undefined,
        expectedEndDate: expectedEndDate || undefined,
        monthlyFee: monthlyFee!,
        totalVolume: totalVolume ? Number(totalVolume) : undefined,
        memo: memo || undefined,
      })
      // 위치 변경 반영 (이동 / 신규 배정 / 미지정 해제)
      if (slotId !== currentSlotId) {
        try {
          if (currentSlotId != null && slotId != null && currentContainerId != null) {
            await containerApi.move({ containerId: currentContainerId, targetSlotId: slotId })
          } else if (currentSlotId == null && slotId != null) {
            await placeContainerAtSlot(target!.id, target!.warehouseId, slotId, {
              customerName: target!.customerName,
              inboundDate: storageStartDate || undefined,
              outboundDate: expectedEndDate || undefined,
            })
          } else if (currentSlotId != null && slotId == null && currentContainerId != null) {
            await containerApi.outbound({ containerId: currentContainerId })
          }
        } catch {
          window.alert('계약은 저장됐지만 위치 변경에 실패했습니다. 컨테이너 관리에서 다시 시도해 주세요.')
        }
      }
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '계약 수정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  const locationChanged = slotId !== currentSlotId

  return (
    <Modal open onClose={onClose} title={`계약 수정`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
          <div>
            <span className="block text-xs text-slate-400">고객</span>
            <span className="font-medium text-slate-700">{target.customerName}</span>
          </div>
          <div>
            <span className="block text-xs text-slate-400">창고</span>
            <span className="font-medium text-slate-700">{target.warehouseName}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">보관 시작일 *</label>
            <input
              type="date"
              value={storageStartDate}
              max={expectedEndDate || undefined}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className={cn(inputCls, periodError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">출고 예정일</label>
            <input
              type="date"
              value={expectedEndDate}
              min={storageStartDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={cn(inputCls, periodError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">보관료 *</label>
            <MoneyInput
              value={monthlyFee}
              onChange={setMonthlyFee}
              required
              placeholder="예: 300,000"
              className={cn(inputCls, 'pr-9')}
            />
          </div>
        </div>

        {periodError && (
          <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {periodError}
          </p>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">컨테이너 위치</label>
            {locationChanged && (
              <button
                type="button"
                onClick={() => setSlotId(currentSlotId)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                되돌리기
              </button>
            )}
          </div>
          <LocationPickerField
            warehouseId={target.warehouseId}
            value={slotId}
            onChange={setSlotId}
            currentSlotId={currentSlotId}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">메모 (특이사항)</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={4}
            placeholder="계약 특이사항이나 부대 정보를 자유롭게 입력하세요."
            className={cn(inputCls, 'min-h-[100px] w-full resize-y leading-relaxed')}
          />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting || periodError != null} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== 계약 등록 ===== */
function CreateOrderModal({
  open,
  onClose,
  customers,
  warehouses,
  onCustomerAdded,
  onDone,
}: {
  open: boolean
  onClose: () => void
  customers: Customer[]
  warehouses: Warehouse[]
  onCustomerAdded: (c: Customer) => void
  onDone: () => void
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [warehouseId, setWarehouseId] = useState('')
  const [slotId, setSlotId] = useState<number | null>(null) // 선택 슬롯(null=미지정)
  const [storageStartDate, setStartDate] = useState(today())
  const [expectedEndDate, setEndDate] = useState('')
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [custOpen, setCustOpen] = useState(false)
  const [dormantConfirm, setDormantConfirm] = useState(false)

  // [실시간 계산] 하루 보관료 = 보관료 ÷ (보관시작일~출고예정일 총 일수, 당일 포함).
  // 보관료·시작일·출고예정일 세 값이 모두 유효할 때만 값이 나오고, 그 외(출고예정일 미입력,
  // 날짜 역전 등)엔 null → 화면엔 빈 값으로 표기. 입력 3종이 바뀔 때만 재계산된다.
  const dailyFee = useMemo(
    () => calcDailyFee(monthlyFee, storageStartDate, expectedEndDate),
    [monthlyFee, storageStartDate, expectedEndDate],
  )

  const isBlacklisted = selectedCustomer?.status === 'BLACKLISTED'
  const isDormant = selectedCustomer?.status === 'DORMANT'

  useEffect(() => {
    if (open) {
      setSelectedCustomer(null)
      setWarehouseId(warehouses[0] ? String(warehouses[0].id) : '')
      setSlotId(null)
      setStartDate(today())
      setEndDate('')
      setMonthlyFee(null)
      setMemo('')
      setFormError(null)
      setDormantConfirm(false)
    }
  }, [open, warehouses])

  const periodError = validateContractPeriod(storageStartDate, expectedEndDate)

  function validate(): boolean {
    if (!selectedCustomer) {
      setFormError('고객을 선택하세요.')
      return false
    }
    if (!warehouseId) {
      setFormError('창고를 선택하세요.')
      return false
    }
    if (periodError) {
      setFormError(periodError)
      return false
    }
    if (monthlyFee == null || monthlyFee <= 0) {
      setFormError('보관료를 입력하세요.')
      return false
    }
    setFormError(null)
    return true
  }

  async function doCreate() {
    setSubmitting(true)
    try {
      const order = await orderApi.create({
        customerId: selectedCustomer!.id,
        warehouseId: Number(warehouseId),
        storageStartDate,
        expectedEndDate: expectedEndDate || undefined,
        monthlyFee: monthlyFee!,
        memo: memo || undefined,
      })
      // 위치를 지정했으면 컨테이너 생성·배정·적재까지 이어서 처리(미지정이면 생략)
      if (slotId != null) {
        try {
          await placeContainerAtSlot(order.id, Number(warehouseId), slotId, {
            customerName: selectedCustomer?.name,
            inboundDate: storageStartDate,
            outboundDate: expectedEndDate || undefined,
          })
        } catch {
          window.alert('계약은 등록됐지만 위치 배치에 실패했습니다. 컨테이너 관리에서 자리를 지정해 주세요.')
        }
      }
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '계약 등록에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    // [하드가드] 블랙리스트는 등록 불가 (버튼도 비활성이지만 이중 방어)
    if (isBlacklisted) {
      setFormError('블랙리스트 고객은 계약을 등록할 수 없습니다.')
      return
    }
    // [소프트경고] 휴면 고객 → 정상 전환 컨펌
    if (isDormant) {
      setDormantConfirm(true)
      return
    }
    void doCreate()
  }

  // 휴면 → 정상 전환 후 계약 진행
  async function confirmDormantAndCreate() {
    setDormantConfirm(false)
    setSubmitting(true)
    try {
      await customerApi.changeStatus(selectedCustomer!.id, { status: 'ACTIVE' })
      setSelectedCustomer((prev) => (prev ? { ...prev, status: 'ACTIVE' } : prev))
      onCustomerAdded({ ...selectedCustomer!, status: 'ACTIVE' })
    } catch (err) {
      setFormError(errMsg(err, '고객 상태 전환에 실패했습니다.'))
      setSubmitting(false)
      return
    }
    await doCreate()
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="계약 등록" widthClass="max-w-5xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 좌: 계약 정보 폼 / 우: 고객(화주) 검색 리스트 */}
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_19rem]">
            {/* ===== 좌측 폼 ===== */}
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">고객 *</label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{selectedCustomer.name}</p>
                      <p className="truncate text-xs text-slate-500">{selectedCustomer.phoneNumber || '연락처 없음'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
                      title="선택 해제"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">
                    오른쪽 목록에서 고객을 선택하세요.
                  </p>
                )}
                {isBlacklisted && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                    블랙리스트 고객입니다{selectedCustomer?.blacklistReason ? ` (사유: ${selectedCustomer.blacklistReason})` : ''}. 계약
                    등록이 불가합니다.
                  </p>
                )}
                {isDormant && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    휴면 상태 고객입니다. 등록 시 정상 거래 고객으로 전환됩니다.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">창고 *</label>
                <select
                  value={warehouseId}
                  onChange={(e) => {
                    setWarehouseId(e.target.value)
                    setSlotId(null) // 창고가 바뀌면 이전 자리 선택 초기화
                  }}
                  className={inputCls}
                >
                  <option value="">창고 선택…</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">컨테이너 위치 지정</label>
                <LocationPickerField
                  warehouseId={warehouseId ? Number(warehouseId) : null}
                  value={slotId}
                  onChange={setSlotId}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">보관 시작일 *</label>
                  <input type="date" value={storageStartDate} onChange={(e) => setStartDate(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">출고 예정일</label>
                  <input
                    type="date"
                    value={expectedEndDate}
                    min={storageStartDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={cn(inputCls, periodError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">보관료 *</label>
                  <MoneyInput
                    value={monthlyFee}
                    onChange={setMonthlyFee}
                    required
                    placeholder="예: 300,000"
                    className={cn(inputCls, 'pr-9')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">일 보관료</label>
                  {/* 보관료·시작일·출고예정일이 모두 유효할 때만 실시간 표시(읽기 전용). 아니면 빈 값 */}
                  <div className="flex h-[38px] items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-indigo-600">
                    {dailyFee != null ? won(dailyFee) : ''}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">보관료 ÷ 보관일수 (당일 포함)</p>
                </div>
              </div>

              {periodError && (
                <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  {periodError}
                </p>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">메모</label>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={4}
                  placeholder="계약 특이사항이나 부대 정보를 자유롭게 입력하세요."
                  className={cn(inputCls, 'min-h-[100px] w-full resize-y leading-relaxed')}
                />
              </div>
            </div>

            {/* ===== 우측 고객 검색 리스트 ===== */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">고객 검색</label>
              <CustomerListPicker
                customers={customers}
                selectedId={selectedCustomer?.id ?? null}
                onSelect={setSelectedCustomer}
                onQuickAdd={() => setCustOpen(true)}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
              취소
            </button>
            <button type="submit" disabled={submitting || isBlacklisted || periodError != null} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
              {submitting ? '등록 중…' : '등록'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 휴면 고객 정상 전환 컨펌 */}
      <Modal open={dormantConfirm} onClose={() => setDormantConfirm(false)} title="휴면 고객 전환">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{selectedCustomer?.name}</span> 님은 휴면 상태인 고객입니다.
            정상 거래 고객으로 전환한 뒤 계약을 진행하시겠습니까?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDormantConfirm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmDormantAndCreate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              전환하고 계약 진행
            </button>
          </div>
        </div>
      </Modal>

      <QuickCustomerModal
        open={custOpen}
        onClose={() => setCustOpen(false)}
        onCreated={(c) => {
          onCustomerAdded(c)
          setSelectedCustomer(c)
          setCustOpen(false)
        }}
      />
    </>
  )
}

/* ===== 고객 빠른 추가 ===== */
function QuickCustomerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (c: Customer) => void
}) {
  const [name, setName] = useState('')
  const [customerType, setType] = useState<CustomerType>('INDIVIDUAL')
  const [phoneNumber, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setType('INDIVIDUAL')
      setPhone('')
      setFormError(null)
    }
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const created = await customerApi.create({
        name,
        customerType,
        phoneNumber: phoneNumber || undefined,
      })
      onCreated(created)
    } catch (err) {
      setFormError(errMsg(err, '고객 등록에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="새 고객 등록">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">고객명 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">유형</label>
            <select value={customerType} onChange={(e) => setType(e.target.value as CustomerType)} className={inputCls}>
              <option value="INDIVIDUAL">개인</option>
              <option value="CORPORATE">기업</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">연락처</label>
            <input value={phoneNumber} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '등록 중…' : '등록'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== 출고 처리 ===== */
function ReleaseModal({
  target,
  onClose,
  onDone,
}: {
  target: StorageOrder | null
  onClose: () => void
  onDone: () => void
}) {
  const [actualEndDate, setDate] = useState(today())
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (target) {
      setDate(today())
      setFormError(null)
    }
  }, [target])

  if (!target) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await orderApi.release(target!.id, actualEndDate)
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '출고 처리에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`${target.customerName} · 출고 처리`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{target.customerName}</span> 계약을 출고 완료 처리합니다.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">실제 출고일 *</label>
          <input type="date" value={actualEndDate} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-60">
            {submitting ? '처리 중…' : '출고 완료'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}
