import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Plus, Loader2, FileText, ShieldAlert, AlertTriangle, X, Truck, Wallet } from 'lucide-react'
import { orderApi, type StorageOrder, type OrderStatus, type PaymentType, type PaymentMethod as OrderPaymentMethod } from '@/api/orderApi'
import { staffApi, type Staff } from '@/api/staffApi'
import { billingApi, type BillingLedger, type PaymentMethod } from '@/api/billingApi'
import { displayStatus, isOpenLedger } from '@/lib/billing'
import { customerApi, type Customer, type CustomerType } from '@/api/customerApi'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { tenantApi } from '@/api/tenantApi'
import OutboundDatePresets from '@/components/ui/OutboundDatePresets'
import { containerApi } from '@/api/containerApi'
import { yardApi } from '@/api/yardApi'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { validateContractPeriod } from '@/lib/dateValidation'
import { calcDailyFee, calcFloorFee } from '@/lib/fee'
import { useFloorPricing } from '@/hooks/useFloorPricing'
import { extractOwner } from '@/lib/owner'
import { nextContainerNo } from '@/lib/containerNo'
import { orderSync } from '@/lib/orderEvents'
import { today, addDays, addMonths, getDurationDays } from '@/lib/dates'
import Modal from '@/components/ui/Modal'
import Fab from '@/components/ui/Fab'
import MoneyInput from '@/components/ui/MoneyInput'
import CustomerListPicker from '@/components/customer/CustomerListPicker'
import LocationPickerField from '@/components/yard/LocationPickerField'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

/**
 * [단순 이진 상태 시각화]
 *
 * 2가지 상태로만 계약 흐름을 표시:
 * 1. 입고 (INBOUND): 초록색 - 창고에 보관 중
 * 2. 출고 (OUTBOUND): 회색 - 창고에서 나감 (종료)
 */
const STATUS_META: Record<OrderStatus, { label: string; cls: string; icon?: string }> = {
  INBOUND: {
    label: '입고',
    cls: 'bg-[#E9EFEA] text-[#5C7C6B] ring-[#D3DFD6]',
    icon: '📦',
  },
  OUTBOUND: {
    label: '출고',
    cls: 'bg-slate-100 text-slate-500 ring-slate-200',
    icon: '✅',
  },
}

type FilterKey = 'ALL' | 'INBOUND' | 'OUTBOUND'
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'INBOUND', label: '입고' },
  { key: 'OUTBOUND', label: '출고' },
]

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
// 모바일 카드용 짧은 날짜(MM.DD) — 큰 글씨에서도 줄바꿈 없이 들어가도록
const md = (s?: string | null) => (s ? s.slice(5).replace('-', '.') : '미정')

/* 모바일 카드: 라벨-값 한 줄 */
function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-sm font-medium text-slate-400">{label}</span>
      <span className={cn('truncate text-right', strong ? 'text-lg font-bold text-slate-800' : 'text-base text-slate-600')}>
        {value}
      </span>
    </div>
  )
}

/* 모바일 카드: 보조 액션 버튼(큰 터치 영역) */
function MobileBtn({ label, onClick, tone = 'default' }: { label: string; onClick: () => void; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl py-3.5 text-base font-bold transition active:scale-[0.99]',
        tone === 'danger'
          ? 'bg-red-50 text-red-600 active:bg-red-100'
          : 'bg-slate-100 text-slate-700 active:bg-slate-200',
      )}
    >
      {label}
    </button>
  )
}

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
  // 컨테이너 번호는 '업체 전체'에서 유일해야 하므로 전 창고 컨테이너를 기준으로 채번한다.
  const existing = await containerApi.list({})
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
  const [billingTarget, setBillingTarget] = useState<StorageOrder | null>(null) // 정산 타임라인
  const [statusTarget, setStatusTarget] = useState<StorageOrder | null>(null) // 입/출고 처리 모달 대상
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

  // [실시간 동기화] 컨테이너 관리에서 출고 등 상태 변경 시 계약 목록도 갱신
  useEffect(() => orderSync.subscribe(reload), [])

  // [현장 자동 갱신] 수동 새로고침 없이 60초마다 최신화 (탭이 화면에 보일 때만)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshKey((k) => k + 1)
    }, 60000)
    return () => clearInterval(id)
  }, [])

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
    return orders.filter((o) => o.status === filter)
  }, [orders, filter])

  // [상태 처리 완료] 모달에서 처리된 결과를 해당 행만 즉시 반영 (새로고침 없음)
  function handleStatusChanged(updated: StorageOrder) {
    setOrders((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
    orderSync.emit() // 일정·매출·야적장 화면에 전파
  }

  // [출고 취소] 소급 복구 — 종료일·보관료 롤백 + 정산 취소 + 컨테이너 원자리 복구
  async function handleCancelRelease(o: StorageOrder) {
    if (!window.confirm(`'${o.customerName}' 계약의 출고를 취소할까요?\n보관 종료일·정산이 원래대로 복구되고 컨테이너 자리가 다시 사용중이 됩니다.`)) return
    try {
      const updated = await orderApi.changeStatus(o.id, { targetStatus: 'INBOUND' })
      handleStatusChanged(updated)
    } catch (err) {
      alert(errMsg(err, '출고 취소에 실패했습니다.'))
    }
  }

  async function handleDelete(o: StorageOrder) {
    if (!window.confirm(`'${o.customerName}' 계약을 삭제할까요?\n(연결된 청구 원장·입금 내역도 함께 삭제됩니다)`)) return
    try {
      await orderApi.remove(o.id)
      // 화면에서 즉시 제거 (비동기 부분 갱신)
      setOrders((prev) => prev.filter((x) => x.id !== o.id))
      // [동기화] 삭제도 일정에서 사라져야 하므로 전파
      orderSync.emit()
    } catch (err) {
      alert(errMsg(err, '계약 삭제에 실패했습니다.'))
    }
  }

  // [작업 버튼 그룹] 데스크톱 테이블 · 모바일 카드가 동일 로직/규격을 공유 (중복 제거)
  const renderActions = (o: StorageOrder) => (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {o.status === 'INBOUND' ? (
        <RowAction label="출고" tooltip="출고 처리" tone="amber" onClick={() => setStatusTarget(o)} />
      ) : (
        <RowAction label="출고취소" tooltip="출고 취소 (소급 복구)" tone="amber" onClick={() => handleCancelRelease(o)} />
      )}
      <RowAction label="정산" tooltip="정산원장 조회" tone="muted" onClick={() => setBillingTarget(o)} />
      <RowAction label="수정" tooltip="계약 수정" tone="muted" onClick={() => setEditTarget(o)} />
      {isAdmin && <RowAction label="삭제" tooltip="계약 삭제" tone="danger" onClick={() => handleDelete(o)} />}
    </div>
  )

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">계약 관리</h2>
          <p className="mt-1 text-sm text-slate-500">보관 계약을 등록하고 입고·출고 일정을 관리합니다.</p>
        </div>
        {/* 데스크톱: 상단 버튼 / 모바일: 하단 FAB(엄지 존)이 대신한다 */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 md:flex"
        >
          <Plus size={16} />
          계약 등록
        </button>
      </div>

      <Fab actions={[{ label: '계약 등록', icon: Plus, onClick: () => setCreateOpen(true) }]} />

      {/* 데스크톱: 작은 필터 칩 */}
      <div className="hidden flex-wrap items-center gap-1.5 md:flex">
        {FILTERS.map((f) => {
          const count =
            f.key === 'ALL'
              ? orders.length
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

      {/* 모바일: 큰 상태 퀵탭 — 한 번 터치로 원하는 상태만 보기 */}
      <div className="grid grid-cols-3 gap-2 md:hidden">
        {FILTERS.map((f) => {
          const count =
            f.key === 'ALL' ? orders.length : orders.filter((o) => o.status === f.key).length
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex flex-col items-center rounded-2xl py-3 text-base font-bold transition active:scale-[0.98]',
                active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-500 ring-1 ring-slate-200',
              )}
            >
              {f.label}
              <span className={cn('mt-0.5 text-sm font-semibold', active ? 'text-white/80' : 'text-slate-400')}>{count}</span>
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

      {/* ===== 데스크톱: 테이블 (md 이상) ===== */}
      {!loading && !error && visible.length > 0 && (
        <div className="hidden overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60 md:block">
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
                    <OrderLocationBadge locs={locationsByOrder.get(o.id) ?? []} />
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {o.storageStartDate}
                    <span className="text-slate-300"> ~ </span>
                    {o.actualEndDate ?? o.expectedEndDate ?? '미정'}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-700">{won(o.monthlyFee)}</td>
                  <td className="px-5 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-5 py-3">{renderActions(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 모바일: 큰 요약 카드 + 원터치 액션 (md 미만) ===== */}
      {!loading && !error && visible.length > 0 && (
        <div className="space-y-3 md:hidden">
          {visible.map((o) => {
            // [방어적 표시] 출고 예정일이 지났는데 아직 보관 중 → '출고 지연' 경고
            const delayed = o.status === 'INBOUND' && o.expectedEndDate != null && o.expectedEndDate < today()
            const locs = locationsByOrder.get(o.id) ?? []
            return (
              <div key={o.id} className="rounded-2xl bg-white p-5 shadow-soft ring-1 ring-slate-200/60">
                {/* 헤더: 고객 + 상태 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold text-slate-800">{o.customerName}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-500">{o.warehouseName}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    {delayed && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                        <AlertTriangle size={12} /> 출고 지연
                      </span>
                    )}
                  </div>
                </div>

                {/* 핵심 정보 */}
                <div className="mt-4 space-y-2.5">
                  <InfoRow label="보관료" value={won(o.monthlyFee)} strong />
                  <InfoRow label="보관기간" value={`${md(o.storageStartDate)} ~ ${md(o.actualEndDate ?? o.expectedEndDate)}`} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-sm font-medium text-slate-400">위치</span>
                    <OrderLocationBadge locs={locs} />
                  </div>
                </div>

                {/* 원터치 액션 */}
                <div className="mt-4 space-y-2">
                  {o.status === 'INBOUND' ? (
                    <button
                      type="button"
                      onClick={() => setStatusTarget(o)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-lg font-bold text-white shadow-sm transition active:scale-[0.99]"
                    >
                      <Truck size={20} /> 출고 처리
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBillingTarget(o)}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-lg font-bold text-white shadow-sm transition active:scale-[0.99]"
                    >
                      <Wallet size={20} /> 정산 보기
                    </button>
                  )}
                  <div className={cn('grid gap-2', isAdmin ? 'grid-cols-3' : 'grid-cols-2')}>
                    {o.status === 'INBOUND' ? (
                      <MobileBtn label="정산" onClick={() => setBillingTarget(o)} />
                    ) : (
                      <MobileBtn label="출고취소" onClick={() => handleCancelRelease(o)} />
                    )}
                    <MobileBtn label="수정" onClick={() => setEditTarget(o)} />
                    {isAdmin && <MobileBtn label="삭제" tone="danger" onClick={() => handleDelete(o)} />}
                  </div>
                </div>
              </div>
            )
          })}
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
          orderSync.emit() // 위치·기간·보관료 변경을 야적장/캘린더/매출 화면에 실시간 전파
        }}
      />

      <StatusChangeModal
        target={statusTarget}
        onClose={() => setStatusTarget(null)}
        onDone={(updated) => {
          setStatusTarget(null)
          handleStatusChanged(updated)
        }}
      />

      <OrderBillingModal target={billingTarget} isAdmin={isAdmin} onClose={() => setBillingTarget(null)} />
    </div>
  )
}

/* ===== 정산 타임라인 (계약 상세 — 회차별 보관료) =====
 * "이 고객 정산 어떻게 돼가?"에 화면 한 장으로 답한다.
 * 회차(원장)별 기간·상태·수금/잔액을 시간순으로 보여주고, 그 자리에서 바로 입금을 기록한다.
 */
function OrderBillingModal({ target, isAdmin, onClose }: { target: StorageOrder | null; isAdmin: boolean; onClose: () => void }) {
  const [ledgers, setLedgers] = useState<BillingLedger[]>([])
  const [loading, setLoading] = useState(true)
  const [payTarget, setPayTarget] = useState<BillingLedger | null>(null) // 입금 기록 중인 회차
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [paidOn, setPaidOn] = useState(today())
  const [saving, setSaving] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  // 청구서 생성
  const [creating, setCreating] = useState(false)
  const [genOpen, setGenOpen] = useState(false)
  const [genStart, setGenStart] = useState('')
  const [genEnd, setGenEnd] = useState('')
  const [genAmount, setGenAmount] = useState<number | null>(null)
  const [genDue, setGenDue] = useState('')
  const [genError, setGenError] = useState<string | null>(null)

  function load(orderId: number) {
    setLoading(true)
    billingApi
      .list()
      .then((all) =>
        setLedgers(
          all
            .filter((l) => l.storageOrderId === orderId && l.status !== 'CANCELED')
            .sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1)),
        ),
      )
      .catch(() => setLedgers([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (target) {
      setPayTarget(null)
      setPayError(null)
      load(target.id)
    }
  }, [target])

  if (!target) return null

  function openPay(l: BillingLedger) {
    setPayTarget(l)
    setAmount(l.balance) // 기본값 = 잔액 전액 (부분입금이면 수정)
    setMethod('BANK_TRANSFER')
    setPaidOn(today())
    setPayError(null)
  }

  async function submitPay(e: FormEvent) {
    e.preventDefault()
    if (!payTarget || amount == null || amount <= 0) {
      setPayError('입금액을 입력하세요.')
      return
    }
    setSaving(true)
    try {
      await billingApi.recordPayment(payTarget.id, { amount, method, paidOn })
      setPayTarget(null)
      load(target!.id)
    } catch (err) {
      setPayError(errMsg(err, '입금 기록에 실패했습니다.'))
    } finally {
      setSaving(false)
    }
  }

  // 다음 청구 회차 기본값 프리필: 시작 = 마지막 회차 종료 다음날(없으면 계약 시작일), 종료 = +1개월
  function openGenerator() {
    const last = [...ledgers].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1)).at(-1)
    const start = last ? addDays(last.periodEnd, 1) : (target!.storageStartDate ?? today())
    setGenStart(start)
    setGenEnd(addMonths(start, 1))
    setGenAmount(target!.monthlyFee ?? null)
    setGenDue(start) // 선납 기준 납기 = 기간 시작일 (필요 시 조정)
    setGenError(null)
    setGenOpen(true)
  }

  // 청구서 생성 → 곧바로 발행(ISSUED)까지 → 입금 기록 가능 상태로
  async function submitGenerate(e: FormEvent) {
    e.preventDefault()
    if (!genStart || !genEnd) return setGenError('청구 기간을 입력하세요.')
    if (genAmount == null || genAmount <= 0) return setGenError('청구 금액을 입력하세요.')
    if (genEnd < genStart) return setGenError('종료일은 시작일보다 빠를 수 없습니다.')
    setCreating(true)
    try {
      const created = await billingApi.createLedger({
        storageOrderId: target!.id,
        billingType: 'MONTHLY',
        settlementType: 'PREPAID',
        periodStart: genStart,
        periodEnd: genEnd,
        baseAmount: genAmount,
        dueDate: genDue || undefined,
      })
      await billingApi.issue(created.id, genDue || undefined) // 발행해야 수금 가능
      setGenOpen(false)
      load(target!.id)
      // [보관기간 동기화] 회차 청구로 계약 종료일이 확장됐을 수 있으니 계약·달력 갱신
      orderSync.emit()
    } catch (err) {
      setGenError(errMsg(err, '청구서 생성에 실패했습니다.'))
    } finally {
      setCreating(false)
    }
  }

  // DRAFT 원장 즉시 발행
  async function issueLedger(l: BillingLedger) {
    try {
      await billingApi.issue(l.id, l.dueDate ?? undefined)
      load(target!.id)
    } catch (err) {
      window.alert(errMsg(err, '발행에 실패했습니다.'))
    }
  }

  const totalBalance = ledgers.reduce((s, l) => s + (isOpenLedger(l) ? l.balance : 0), 0)

  return (
    <Modal open onClose={onClose} title={`${target.customerName} · 정산 이력`} widthClass="max-w-2xl">
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="text-slate-500">
            계약 기간 <span className="font-medium text-slate-700">{target.storageStartDate} ~ {target.actualEndDate ?? target.expectedEndDate ?? '미정'}</span>
          </span>
          <span className={cn('font-semibold', totalBalance > 0 ? 'text-[#A65B44]' : 'text-[#5C7C6B]')}>
            {totalBalance > 0 ? `미수 잔액 ${won(totalBalance)}` : '미수 없음'}
          </span>
        </div>

        {/* 청구서 생성 (관리자) — 원장이 없으면 여기서 만들어야 정산이 시작된다 */}
        {isAdmin && !genOpen && (
          <button
            type="button"
            onClick={openGenerator}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50"
          >
            <Plus size={15} /> 청구서 생성 (이번 회차)
          </button>
        )}
        {genOpen && (
          <form onSubmit={submitGenerate} className="space-y-2.5 rounded-xl bg-indigo-50/40 p-3.5 ring-1 ring-indigo-200/60">
            <p className="text-xs font-semibold text-slate-600">청구서 생성 · 생성 즉시 발행되어 입금 기록이 가능합니다</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[11px] text-slate-500">청구 시작일</label>
                <input type="date" value={genStart} max={genEnd || undefined} onChange={(e) => setGenStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-slate-500">청구 종료일</label>
                <input type="date" value={genEnd} min={genStart || undefined} onChange={(e) => setGenEnd(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-slate-500">청구 금액</label>
                <MoneyInput value={genAmount} onChange={setGenAmount} required className={cn(inputCls, 'pr-8')} />
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] text-slate-500">납기일</label>
                <input type="date" value={genDue} onChange={(e) => setGenDue(e.target.value)} className={inputCls} />
              </div>
            </div>
            {genError && <p className="text-xs text-red-600">{genError}</p>}
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setGenOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-white">
                취소
              </button>
              <button type="submit" disabled={creating} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
                {creating ? '생성 중…' : '생성 + 발행'}
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm">정산 이력을 불러오는 중…</span>
          </div>
        )}

        {!loading && ledgers.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
            아직 생성된 청구 회차가 없습니다.
            {isAdmin ? ' 위 "청구서 생성"으로 이번 회차를 만들면 바로 입금을 기록할 수 있습니다.' : ' 원장은 매월 1일 자동 생성됩니다.'}
          </p>
        )}

        {!loading && ledgers.length > 0 && (
          <ol className="space-y-2">
            {ledgers.map((l, i) => {
              const ds = displayStatus(l)
              const paying = payTarget?.id === l.id
              return (
                <li key={l.id} className="rounded-xl bg-white p-3.5 ring-1 ring-slate-200/70">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">{i + 1}회차</span>
                    <span className="text-sm font-medium text-slate-700">
                      {l.periodStart} ~ {l.periodEnd}
                    </span>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1', ds.cls)}>
                      {ds.label}
                    </span>
                    <span className="ml-auto text-sm text-slate-500">
                      <span className="font-semibold text-slate-800">{won(l.paidTotal)}</span>
                      <span className="text-slate-300"> / </span>
                      {won(l.baseAmount + l.carriedOverIn + l.adjustmentTotal)}
                    </span>
                    {l.status === 'DRAFT' && isAdmin && (
                      <button
                        type="button"
                        onClick={() => issueLedger(l)}
                        className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-50"
                      >
                        발행
                      </button>
                    )}
                    {isOpenLedger(l) && l.balance > 0 && !paying && (
                      <button
                        type="button"
                        onClick={() => openPay(l)}
                        className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-700"
                      >
                        입금 기록
                      </button>
                    )}
                  </div>
                  {l.carriedOverIn > 0 && (
                    <p className="mt-1 text-[11px] text-slate-400">전 회차 이월 미수 {won(l.carriedOverIn)} 포함</p>
                  )}

                  {/* 인라인 입금 기록 폼 */}
                  {paying && (
                    <form onSubmit={submitPay} className="mt-2.5 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
                      <div className="min-w-[8rem] flex-1">
                        <label className="mb-0.5 block text-[11px] text-slate-500">입금액 (잔액 {won(l.balance)})</label>
                        <MoneyInput value={amount} onChange={setAmount} required className={cn(inputCls, 'pr-8')} />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-500">방법</label>
                        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
                          <option value="BANK_TRANSFER">계좌이체</option>
                          <option value="CASH">현금</option>
                          <option value="CARD">카드</option>
                          <option value="OTHER">기타</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-slate-500">입금일</label>
                        <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputCls} />
                      </div>
                      <div className="flex gap-1.5">
                        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
                          {saving ? '기록 중…' : '기록'}
                        </button>
                        <button type="button" onClick={() => setPayTarget(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 transition hover:bg-white">
                          취소
                        </button>
                      </div>
                      {payError && <p className="w-full text-xs text-red-600">{payError}</p>}
                    </form>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </Modal>
  )
}

/* ===== 계약 수정 (출고예정일·월보관료·보관용량(톤)·메모) ===== */
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
  const [capacityTons, setCapacityTons] = useState('')
  const [memo, setMemo] = useState('')
  // [청구 조건] 등록 화면과 동일한 필드 — 결제 방식/수단/입금계좌/납기일
  const [paymentType, setPaymentType] = useState<PaymentType>('POSTPAID')
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('BANK_TRANSFER')
  const [settlementUserId, setSettlementUserId] = useState<number | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [dueDate, setDueDate] = useState('')
  const [dueTouched, setDueTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // 위치: 선택 슬롯 / 현재(원래) 슬롯·컨테이너
  const [slotId, setSlotId] = useState<number | null>(null)
  const [currentSlotId, setCurrentSlotId] = useState<number | null>(null)
  const [currentContainerId, setCurrentContainerId] = useState<number | null>(null)
  // [층 단가 연동] feeTier = 보관료 계산 기준 층(현재 배정된 컨테이너의 층 또는 사용자가 새로 고른 층).
  //   feeAuto = 사용자가 날짜/위치를 실제로 건드린 뒤에만 true → 그 전까지는 저장된 보관료를 보존한다.
  const [feeTier, setFeeTier] = useState<number | null>(null)
  const [feeAuto, setFeeAuto] = useState(false)
  const floorPrices = useFloorPricing(target?.warehouseId ?? null, target != null)

  useEffect(() => {
    if (target) {
      setStartDate(target.storageStartDate ?? '')
      setEndDate(target.expectedEndDate ?? '')
      setMonthlyFee(target.monthlyFee)
      setCapacityTons(target.capacityTons != null ? String(target.capacityTons) : '')
      setMemo(target.memo ?? '')
      setPaymentType(target.paymentType ?? 'POSTPAID')
      setPaymentMethod(target.paymentMethod ?? 'BANK_TRANSFER')
      setSettlementUserId(target.settlementUserId ?? null)
      setDueDate(target.dueDate ?? '')
      setDueTouched(true) // 기존값 보존 — 사용자가 결제 방식을 바꿀 때만 자동 매핑 시작
      setFeeTier(null)
      setFeeAuto(false) // 저장된 보관료 보존 — 날짜/위치를 실제로 바꾼 뒤에만 자동 재계산
      setFormError(null)
    }
  }, [target])

  // [입금 계좌] 담당 직원 목록 (계좌이체 시 선택용)
  useEffect(() => {
    if (!target) return
    let alive = true
    staffApi.list().then((s) => alive && setStaffList(s)).catch(() => alive && setStaffList([]))
    return () => {
      alive = false
    }
  }, [target])

  // [납기일 자동 매핑] 등록 화면과 동일 — 선불=시작일 / 후불=종료일. 사용자가 만지면 중단.
  useEffect(() => {
    if (dueTouched) return
    const mapped = paymentType === 'PREPAID' ? storageStartDate : expectedEndDate || storageStartDate
    if (mapped) setDueDate(mapped)
  }, [paymentType, storageStartDate, expectedEndDate, dueTouched])

  // 위치(층) 선택 또는 보관 기간 변경 시 층 단가·최소료로 보관료 자동 보정 (공통 엔진)
  //   feeAuto=false(초기 로드)면 저장된 보관료를 그대로 두고, 사용자가 날짜/위치를 바꾼 뒤에만 재계산한다.
  useEffect(() => {
    if (!feeAuto || feeTier == null) return
    const rate = floorPrices.get(feeTier)
    if (rate) setMonthlyFee(calcFloorFee(rate, storageStartDate, expectedEndDate))
  }, [feeAuto, feeTier, floorPrices, storageStartDate, expectedEndDate])

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
          setFeeTier(slot.tier ?? null) // 현재 배정된 층을 보관료 재계산 기준으로 (feeAuto 전까진 미적용)
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
        capacityTons: capacityTons ? Number(capacityTons) : undefined,
        paymentType,
        paymentMethod,
        settlementUserId: paymentMethod === 'BANK_TRANSFER' ? (settlementUserId ?? undefined) : undefined,
        dueDate: dueDate || undefined,
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
        } catch (e) {
          window.alert(`계약은 저장됐지만 위치 변경에 실패했습니다.\n(${errMsg(e, '원인 미상')})`)
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
  const dailyFee = calcDailyFee(monthlyFee, storageStartDate, expectedEndDate)

  return (
    <Modal open onClose={onClose} title="계약 수정" widthClass="max-w-5xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 좌: 계약 정보 / 우: 컨테이너 위치 지정 (등록 팝업과 동일 템플릿) */}
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_26rem]">
          {/* ===== 좌측 폼 ===== */}
          <div className="space-y-4">
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
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setFeeAuto(true) // 날짜 변경 → 층 단가 기준 보관료 자동 재계산 시작
                  }}
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
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setFeeAuto(true) // 날짜 변경 → 층 단가 기준 보관료 자동 재계산 시작
                  }}
                  className={cn(inputCls, periodError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
                />
                <OutboundDatePresets
                  startDate={storageStartDate}
                  onPick={(d) => {
                    setEndDate(d)
                    setFeeAuto(true)
                  }}
                  className="mt-1.5"
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
                <label className="mb-1 block text-sm font-medium text-slate-700">하루 보관료</label>
                <div className="flex h-[38px] items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-indigo-600">
                  {dailyFee != null ? won(dailyFee) : ''}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">보관료 ÷ 보관일수 (당일 포함)</p>
              </div>
              
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">결제 방식 *</label>
                <select
                  value={paymentType}
                  onChange={(e) => {
                    setPaymentType(e.target.value as PaymentType)
                    setDueTouched(false) // 결제 방식 바꾸면 납기일 자동 매핑 재개
                  }}
                  className={inputCls}
                >
                  <option value="PREPAID">선불 (완납)</option>
                  <option value="POSTPAID">후불 (입금예정)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">보관 용량 (톤)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={capacityTons}
                    onChange={(e) => setCapacityTons(e.target.value)}
                    placeholder="예: 2.5"
                    className={cn(inputCls, 'pr-10')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">톤</span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">결제 수단 *</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)} className={inputCls}>
                  <option value="BANK_TRANSFER">계좌이체</option>
                  <option value="CASH">현금</option>
                  <option value="CARD">카드</option>
                </select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  납기일
                  {!dueTouched && (
                    <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                      {paymentType === 'PREPAID' ? '보관 시작일 자동' : '보관 종료일 자동'}
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value)
                    setDueTouched(true)
                  }}
                  className={inputCls}
                />
              </div>
            </div>

            {/* [계좌 연동] 계좌이체일 때만 입금 계좌(담당 직원) 지정 폼 노출 — 등록 화면과 동일 */}
            {paymentMethod === 'BANK_TRANSFER' && (
              <PaymentAccountPicker staffList={staffList} value={settlementUserId} onChange={setSettlementUserId} />
            )}

            {periodError && (
              <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {periodError}
              </p>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">메모 (특이사항)</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder="계약 특이사항이나 부대 정보를 자유롭게 입력하세요."
                className={cn(inputCls, 'min-h-[64px] w-full resize-y leading-relaxed')}
              />
            </div>
          </div>

          {/* ===== 우측 컨테이너 위치 지정 ===== */}
          <div className="flex flex-col">
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
              onPickSlot={(s) => {
                setFeeTier(s?.tier ?? null)
                setFeeAuto(true) // 위치(층) 변경 → 새 층 단가로 보관료 자동 재계산
              }}
              currentSlotId={currentSlotId}
            />
          </div>
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
  const [capacityTons, setCapacityTons] = useState<number | null>(null) // 보관 용량(톤)
  const [paymentType, setPaymentType] = useState<PaymentType>('PREPAID')
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('BANK_TRANSFER') // 결제 수단 기본 계좌이체
  // [납기일] 선불→보관 시작일 / 후불→보관 종료일이 제로클릭 기본값. 사용자가 만지면(dueTouched) 자동 매핑 중단.
  const [dueDate, setDueDate] = useState('')
  const [dueTouched, setDueTouched] = useState(false)
  const [settlementUserId, setSettlementUserId] = useState<number | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [custOpen, setCustOpen] = useState(false)
  const [dormantConfirm, setDormantConfirm] = useState(false)
  // [마스터 기본값] 전역 기본 계약 유지 기간(일) = '당일 포함 보관일수'.
  //   출고예정일 = 보관 시작일 + (defaultDays - 1). 예) 10 → 07.21~07.30 (당일 포함 10일). 기본 10.
  const [defaultDays, setDefaultDays] = useState(10)
  useEffect(() => {
    tenantApi.me().then((t) => setDefaultDays(t.defaultStoragePeriodDays ?? 10)).catch(() => {})
  }, [])

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
      setEndDate(addDays(today(), Math.max(defaultDays - 1, 0))) // 당일 포함 defaultDays일
      setMonthlyFee(null)
      setCapacityTons(null)
      setPaymentType('PREPAID')
      setPaymentMethod('BANK_TRANSFER')
      setSettlementUserId(null)
      setDueDate(today()) // 선불 기본값 = 보관 시작일(=today)
      setDueTouched(false)
      setFeeTier(null)
      setMemo('')
      setFormError(null)
      setDormantConfirm(false)
    }
  }, [open, warehouses])

  // [납기일 제로클릭 자동 세팅] 결제 방식/기준 날짜가 바뀌면 납기 기본값을 즉시 매핑한다.
  //   · 선불: 보관 시작일  · 후불: 보관 종료일(없으면 시작일)
  //   사용자가 납기일을 직접 만진 뒤(dueTouched)엔 덮어쓰지 않아 수동 변경을 존중한다.
  useEffect(() => {
    if (dueTouched) return
    const mapped = paymentType === 'PREPAID' ? storageStartDate : expectedEndDate || storageStartDate
    if (mapped) setDueDate(mapped)
  }, [paymentType, storageStartDate, expectedEndDate, dueTouched])

  // [자동 계산] 보관 시작일이 변경되면 출고 예정일을 전역 기본 기간(당일 포함)만큼 뒤로 설정
  useEffect(() => {
    if (storageStartDate && !expectedEndDate) {
      setEndDate(addDays(storageStartDate, Math.max(defaultDays - 1, 0)))
    }
  }, [storageStartDate])

  // [수납 계좌] 직원 목록 로드 (계좌이체 시 담당 직원 선택용) — 권한 없으면 빈 목록
  useEffect(() => {
    if (!open) return
    let alive = true
    staffApi.list().then((s) => alive && setStaffList(s)).catch(() => alive && setStaffList([]))
    return () => {
      alive = false
    }
  }, [open])

  // [층 단가 연동] 공통 로더 — 슬롯 선택/기간 변경 시 보관료 자동 보정
  const floorPrices = useFloorPricing(warehouseId ? Number(warehouseId) : null, open)
  const [feeTier, setFeeTier] = useState<number | null>(null)
  useEffect(() => {
    if (feeTier == null) return
    const rate = floorPrices.get(feeTier)
    if (rate) setMonthlyFee(calcFloorFee(rate, storageStartDate, expectedEndDate))
  }, [feeTier, floorPrices, storageStartDate, expectedEndDate])

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
      // [선불 자동 정산] paymentType=PREPAID면 백엔드가 계약 등록과 한 트랜잭션으로
      //   청구 원장 생성 → 발행 → 전액 수금까지 원자적으로 완결한다 (부분 실패 없음).
      const order = await orderApi.create({
        customerId: selectedCustomer!.id,
        warehouseId: Number(warehouseId),
        storageStartDate,
        expectedEndDate: expectedEndDate || undefined,
        monthlyFee: monthlyFee!,
        paymentType,
        paymentMethod,
        settlementUserId: paymentMethod === 'BANK_TRANSFER' ? (settlementUserId ?? undefined) : undefined,
        dueDate: dueDate || undefined,
        capacityTons: capacityTons ?? undefined,
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
        } catch (e) {
          window.alert(`계약은 등록됐지만 위치 배치에 실패했습니다.\n(${errMsg(e, '원인 미상')})`)
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
                  onPickSlot={(s) => setFeeTier(s?.tier ?? null)}
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
                  <OutboundDatePresets startDate={storageStartDate} onPick={setEndDate} className="mt-1.5" />
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
                  <label className="mb-1 block text-sm font-medium text-slate-700">하루 보관료</label>
                  {/* 보관료·시작일·출고예정일이 모두 유효할 때만 실시간 표시(읽기 전용). 아니면 빈 값 */}
                  <div className="flex h-[38px] items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-indigo-600">
                    {dailyFee != null ? won(dailyFee) : ''}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">보관료 ÷ 보관일수 (당일 포함)</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">결제 방식 *</label>
                  <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={inputCls}>
                    <option value="PREPAID">선불 (당일 완납)</option>
                    <option value="POSTPAID">후불</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">결제 수단 *</label>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)} className={inputCls}>
                    <option value="BANK_TRANSFER">계좌이체</option>
                    <option value="CASH">현금</option>
                    <option value="CARD">카드</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    납기일
                    {!dueTouched && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
                        {paymentType === 'PREPAID' ? '보관 시작일 자동' : '보관 종료일 자동'}
                      </span>
                    )}
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value)
                      setDueTouched(true)
                    }}
                    className={inputCls}
                  />
                  {dueTouched && (
                    <button
                      type="button"
                      onClick={() => setDueTouched(false)}
                      className="mt-1 text-[11px] text-slate-400 underline-offset-2 hover:text-indigo-600 hover:underline"
                    >
                      결제 방식 기준으로 되돌리기
                    </button>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">보관 용량 (톤)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={capacityTons ?? ''}
                      onChange={(e) => setCapacityTons(e.target.value === '' ? null : Number(e.target.value))}
                      placeholder="예: 2.5"
                      className={cn(inputCls, 'pr-10')}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">톤</span>
                  </div>
                </div>
              </div>

              {/* [계좌 연동] 계좌이체일 때만 입금 계좌(담당 직원) 지정 폼 노출 */}
              {paymentMethod === 'BANK_TRANSFER' && (
                <PaymentAccountPicker
                  staffList={staffList}
                  value={settlementUserId}
                  onChange={setSettlementUserId}
                />
              )}

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
                  rows={2}
                  placeholder="계약 특이사항이나 부대 정보를 자유롭게 입력하세요."
                  className={cn(inputCls, 'min-h-[64px] w-full resize-y leading-relaxed')}
                />
              </div>
            </div>

            {/* ===== 우측 고객 검색 리스트 (좌측 폼 높이에 맞춰 확장, 모바일 최소 높이 보장) ===== */}
            <div className="flex flex-col">
              <label className="mb-1 block text-sm font-medium text-slate-700">고객 검색</label>
              <CustomerListPicker
                customers={customers}
                selectedId={selectedCustomer?.id ?? null}
                onSelect={setSelectedCustomer}
                onQuickAdd={() => setCustOpen(true)}
                heightClass=""
                className="min-h-[18rem] flex-1"
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


/* ===== 입/출고 유형별 처리 모달 =====
 * 배지 클릭 시 즉시 팝업. '정상' 유형이 기본 선택이라 대개 [확인]만 누르면 끝난다.
 * '중도 출고'/'지연 입고' 같은 특수 유형을 고를 때만 하단 옵션(소급/실제일)이 동적으로 노출된다.
 */
type ReleaseKind = 'NORMAL' | 'EARLY'
type ReturnKind = 'NORMAL' | 'LATE'

function StatusChangeModal({
  target,
  onClose,
  onDone,
}: {
  target: StorageOrder | null
  onClose: () => void
  onDone: (updated: StorageOrder) => void
}) {
  const isRelease = target?.status === 'INBOUND' // 입고 → 출고 처리
  const [releaseKind, setReleaseKind] = useState<ReleaseKind>('NORMAL')
  const [returnKind, setReturnKind] = useState<ReturnKind>('NORMAL')
  const [actualEndDate, setActualEndDate] = useState('')
  const [actualStartDate, setActualStartDate] = useState('')
  const [applySettlement, setApplySettlement] = useState(true)
  const [dailyRate, setDailyRate] = useState<number | null>(6000) // 하루 보관료 (직접 입력, 기본 6,000원)
  const [usedAmount, setUsedAmount] = useState<number | null>(null) // 실사용 보관료 = 일수 × 하루 (자동계산·수정 가능)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // [날짜 기반 옵션 제어] 부모가 가진 계약 기간 + 오늘 날짜만으로 가볍게 판정 (재조회 없음).
  //  - 출고: 오늘 < 종료일 → 조기 출고이므로 '정상 출고' 불가·'중도 출고' 기본. 만기 도래 시 반대.
  //  - 입고: 오늘 > 시작일 → 이미 시작일 지남이므로 '정상 입고' 불가·'지연 입고' 기본.
  const opt = useMemo(() => {
    const t = today()
    const end = target?.expectedEndDate ?? null
    const start = target?.storageStartDate ?? null
    const beforeExpiry = end != null && t < end // 종료일 미도래
    const afterStart = start != null && t > start // 시작일 경과
    return {
      releaseNormalDisabled: beforeExpiry,
      releaseEarlyDisabled: end != null && !beforeExpiry,
      defaultRelease: (beforeExpiry ? 'EARLY' : 'NORMAL') as ReleaseKind,
      returnNormalDisabled: afterStart,
      returnLateDisabled: start != null && !afterStart,
      defaultReturn: (afterStart ? 'LATE' : 'NORMAL') as ReturnKind,
    }
  }, [target])

  useEffect(() => {
    if (!target) return
    setReleaseKind(opt.defaultRelease) // 유효 옵션 자동 선선택
    setReturnKind(opt.defaultReturn)
    setActualEndDate(today()) // 중도 출고 기본값 = 오늘
    setActualStartDate(target.storageStartDate ?? today())
    setApplySettlement(true)
    setDailyRate(6000)
    setFormError(null)
  }, [target])

  // 실사용 일수 = 계약 시작일 ~ 실제 출고일 (당일 포함)
  const usedDays = useMemo(() => {
    if (!target || !actualEndDate) return 0
    return Math.max(getDurationDays(target.storageStartDate, actualEndDate), 0)
  }, [target, actualEndDate])

  // [자동계산] 하루 보관료·일수가 바뀌면 실사용 보관료 = 일수 × 하루 보관료 (직접 수정도 가능)
  useEffect(() => {
    if (releaseKind !== 'EARLY') return
    setUsedAmount(usedDays * (dailyRate ?? 0))
  }, [releaseKind, usedDays, dailyRate])

  if (!target) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    try {
      const body = isRelease
        ? {
            targetStatus: 'OUTBOUND' as const,
            // 정상 출고: 예정일 그대로 / 중도 출고: 입력한 실제 출고일 + 소급 여부
            actualEndDate: releaseKind === 'EARLY' ? actualEndDate : (target!.expectedEndDate ?? today()),
            // 중도출고 + 소급 시 실사용 보관료(일수 × 하루 보관료)를 정산 금액으로 전달.
            // 백엔드가 이 금액으로 원장 기본청구액을 재산정하고 보관기간 종료일을 실제 출고일로 마감한다.
            settledAmount: releaseKind === 'EARLY' && applySettlement ? (usedAmount ?? undefined) : undefined,
          }
        : {
            targetStatus: 'INBOUND' as const,
            // 지연 입고일 때만 실제 입고일로 시작일 조정
            actualStartDate: returnKind === 'LATE' ? actualStartDate : undefined,
          }
      const updated = await orderApi.changeStatus(target!.id, body)
      onDone(updated)
    } catch (err) {
      setFormError(errMsg(err, '처리에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isRelease ? `${target.customerName} · 출고 처리` : `${target.customerName} · 입고 처리`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          계약 기간 {target.storageStartDate} ~ {target.expectedEndDate ?? '미정'}
        </p>

        {isRelease ? (
          <>
            <RadioRow
              checked={releaseKind === 'NORMAL'}
              onSelect={() => setReleaseKind('NORMAL')}
              disabled={opt.releaseNormalDisabled}
              title="정상 출고"
              desc="예정일 기준으로 출고 완료 처리합니다."
              hint={opt.releaseNormalDisabled ? '종료일이 도래하지 않아 정상 출고를 선택할 수 없습니다.' : undefined}
            />
            <RadioRow
              checked={releaseKind === 'EARLY'}
              onSelect={() => setReleaseKind('EARLY')}
              disabled={opt.releaseEarlyDisabled}
              title="중도 출고"
              desc="예정일보다 일찍 출고 — 실제 점유 기간으로 보관료를 정산합니다."
              hint={opt.releaseEarlyDisabled ? '이미 보관 기간이 만료되어 중도 출고 대상이 아닙니다.' : undefined}
            />
            {releaseKind === 'EARLY' && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200/70">
                {target.expectedEndDate && actualEndDate && actualEndDate < target.expectedEndDate && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    보관 기간 만료 전 출고이므로 중도 출고 정산이 적용됩니다.
                  </p>
                )}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">실제 출고일</label>
                  <input
                    type="date"
                    value={actualEndDate}
                    min={target.storageStartDate}
                    max={target.expectedEndDate ?? undefined}
                    onChange={(e) => setActualEndDate(e.target.value)}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">보관 시작일 ~ 종료일 범위 내에서 선택할 수 있습니다.</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={applySettlement} onChange={(e) => setApplySettlement(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                  보관료 소급 정산 (실제 사용 기간만큼 차감·환급)
                </label>

                {applySettlement && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">
                      실사용 기간 <span className="font-medium text-slate-700">{target.storageStartDate} ~ {actualEndDate} ({usedDays}일)</span>
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">하루 보관료</label>
                        <MoneyInput value={dailyRate} onChange={setDailyRate} placeholder="6,000" className={cn(inputCls, 'pr-9')} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">실사용 보관료 (일수 × 하루)</label>
                        <MoneyInput value={usedAmount} onChange={setUsedAmount} placeholder="0" className={cn(inputCls, 'pr-9')} />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">하루 보관료·출고일을 바꾸면 실사용 보관료가 자동 계산됩니다(직접 수정 가능).</p>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <RadioRow
              checked={returnKind === 'NORMAL'}
              onSelect={() => setReturnKind('NORMAL')}
              disabled={opt.returnNormalDisabled}
              title="정상 입고"
              desc="출고를 취소하고 보관중 상태로 되돌립니다."
              hint={opt.returnNormalDisabled ? '보관 시작일이 지나 정상 입고를 선택할 수 없습니다.' : undefined}
            />
            <RadioRow
              checked={returnKind === 'LATE'}
              onSelect={() => setReturnKind('LATE')}
              disabled={opt.returnLateDisabled}
              title="지연 입고"
              desc="실제 입고일을 조정해 보관 시작일을 다시 맞춥니다."
              hint={opt.returnLateDisabled ? '아직 시작일이 지나지 않아 지연 입고 대상이 아닙니다.' : undefined}
            />
            {returnKind === 'LATE' && (
              <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200/70">
                <label className="mb-1 block text-sm font-medium text-slate-700">실제 입고일</label>
                <input
                  type="date"
                  value={actualStartDate}
                  max={target.expectedEndDate ?? undefined}
                  onChange={(e) => setActualStartDate(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
          </>
        )}

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '처리 중…' : '확인'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== 계약 목록 '작업' 컬럼 공용 액션 버튼 =====
 * 텍스트형(입/출고)·아이콘형(원장·수정·삭제)을 하나의 규격(h-8·rounded-lg)으로 통일.
 * tone별 은은한 파스텔 호버 + 미세 리프트 마이크로 인터랙션 + title 툴팁.
 */
// [작업 버튼 톤] 순수 텍스트형 — 규격은 공통, 톤만 위계를 만든다.
//  · amber  : 입/출고 등 가장 중요도 높은 상태 전환 버튼 (강조 유지)
//  · muted  : 정산·수정 등 보조 액션 (무채색, 시각적 소음 최소화)
//  · danger : 삭제 (평상시 무채색, 호버 시에만 위험색으로 각성)
type ActionTone = 'amber' | 'muted' | 'danger'
const ACTION_TONE: Record<ActionTone, string> = {
  amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  muted: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800',
  danger: 'border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600',
}

// [공통 작업 버튼] 아이콘 없는 순수 텍스트형. 모든 버튼이 동일한 높이(h-8)·라운딩·폰트를 공유하고,
// 톤(ActionTone)만 달라져 시각적 위계를 만든다. 규격이 한 곳에 모여 유지보수가 쉽다.
function RowAction({
  label,
  tooltip,
  tone,
  onClick,
}: {
  label: string
  tooltip: string
  tone: ActionTone
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        // [터치 타깃] 모바일은 최소 44px 높이(h-11)로 오클릭 방지, 데스크톱은 컴팩트(h-8).
        'inline-flex h-11 shrink-0 items-center justify-center rounded-lg border px-4 text-sm font-medium transition-all duration-150 hover:-translate-y-px active:translate-y-0 md:h-8 md:px-3 md:text-xs',
        ACTION_TONE[tone],
      )}
    >
      {label}
    </button>
  )
}

/** [공용] 계약 위치 배지 — 테이블 셀과 모바일 카드가 동일 렌더를 공유(중복 제거) */
function OrderLocationBadge({ locs }: { locs: string[] }) {
  if (locs.length === 0)
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#E2DCD1] bg-[#EFEBE4]/60 px-2 py-0.5 text-xs font-medium text-[#8A8172]">
        위치 미지정
      </span>
    )
  return (
    <span title={locs.join(', ')} className="inline-flex items-center gap-1">
      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{locs[0]}</span>
      {locs.length > 1 && <span className="text-xs text-slate-400">외 {locs.length - 1}</span>}
    </span>
  )
}

/** [공용] 계약 상태 배지 */
function OrderStatusBadge({ status }: { status: StorageOrder['status'] }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1', STATUS_META[status].cls)}>
      {STATUS_META[status].icon && <span>{STATUS_META[status].icon}</span>}
      {STATUS_META[status].label}
    </span>
  )
}

function RadioRow({
  checked,
  onSelect,
  title,
  desc,
  disabled = false,
  hint,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  desc: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onSelect()}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition',
        disabled
          ? 'cursor-not-allowed border-slate-100 bg-slate-50/60 opacity-60'
          : checked
            ? 'border-indigo-400 bg-indigo-50/50 ring-1 ring-indigo-200'
            : 'border-slate-200 hover:bg-slate-50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          checked && !disabled ? 'border-indigo-500' : 'border-slate-300',
        )}
      >
        {checked && !disabled && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-medium', disabled ? 'text-slate-400' : 'text-slate-800')}>{title}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{desc}</span>
        {disabled && hint && <span className="mt-1 block text-[11px] text-amber-600">{hint}</span>}
      </span>
    </button>
  )
}

/* ===== 계좌이체 시 입금 계좌(담당 직원) 지정 =====
 * 직원 정보에 등록된 주거래 계좌를 동적으로 불러와, 타이핑 없이 선택만으로 수납 계좌를 매핑한다.
 */
function PaymentAccountPicker({
  staffList,
  value,
  onChange,
}: {
  staffList: Staff[]
  value: number | null
  onChange: (id: number | null) => void
}) {
  // 계좌가 등록된 직원만 후보로 (계좌 없는 직원은 매핑 불가)
  const withAccount = staffList.filter((s) => s.accountNumber)
  const selected = withAccount.find((s) => s.id === value) ?? null

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <label className="mb-1 block text-sm font-medium text-slate-700">입금 계좌 (담당 직원)</label>
      {withAccount.length === 0 ? (
        <p className="text-xs text-slate-400">
          계좌가 등록된 직원이 없습니다. 직원 관리 화면에서 주거래 계좌를 먼저 등록하세요.
        </p>
      ) : (
        <>
          <select
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className={inputCls}
          >
            <option value="">계좌 미지정</option>
            {withAccount.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.bankName ?? ''} {s.accountNumber}
              </option>
            ))}
          </select>
          {selected && (
            <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
              <span className="font-medium text-slate-800">{selected.bankName}</span> {selected.accountNumber}
              <span className="ml-1 text-slate-400">· 예금주 {selected.accountHolder ?? selected.name}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}
