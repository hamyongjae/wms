import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import {
  Loader2,
  Search,
  Plus,
  X,
  LogOut,
  ArrowRightLeft,
  Pencil,
  Trash2,
  Wallet,
  Boxes,
  Grid3x3,
  Square,
  Ban,
} from 'lucide-react'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { yardApi, type YardSlot, type FloorPrice } from '@/api/yardApi'
import { containerApi, type Container } from '@/api/containerApi'
import { customerApi, type Customer } from '@/api/customerApi'
import { orderApi, type StorageOrder, type PaymentType, type PaymentMethod } from '@/api/orderApi'
import { orderSync } from '@/lib/orderEvents'
import { placeContainerAtSlot } from '@/lib/containerPlacement'
import { today } from '@/lib/dates'
import StatCard from '@/components/ui/StatCard'
import Modal from '@/components/ui/Modal'
import MoneyInput from '@/components/ui/MoneyInput'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { CreateOrderModal, OrderBillingModal, StatusChangeModal } from './OrdersPage' // [통합] 계약등록·정산·출고 공용 폼(컨테이너 관리 입고에서 창고·자리 고정)
import EditOrderModal from '@/components/order/EditOrderModal' // [통합] 계약수정 공용 폼(계약관리와 완전히 동일한 화면)

/* ===== 타입 명세 ===== */
// 좌표 + 컨테이너가 결합된 슬롯 (백엔드 YardSlotResponse와 매칭)
export type YardSlotDto = YardSlot

// 격자에서 즉시 입고할 때의 요청(컨테이너 생성 + 슬롯 배치 파이프라인)
export interface QuickInboundDto {
  warehouseId: number
  targetSlotId: number
  containerNo: string
  capacityTon: number
  capacityTons?: number // 새 계약 생성 시 보관 용량(톤)
  customerId?: number // 새 계약 자동 생성용
  customerName?: string
  orderId?: number // 선택 시 해당 계약에 배정 / 없으면 새 계약 생성
  monthlyFee?: number // 새 계약 생성 시 보관료
  paymentType?: PaymentType // 새 계약 생성 시 결제 방식
  paymentMethod?: PaymentMethod // 결제 수단 (계좌이체 기본)
  settlementUserId?: number // 계좌이체 시 수납 담당 직원
  inboundDate?: string
  outboundDate?: string
  memo?: string
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

const fmt = (n: number) => n.toLocaleString('ko-KR')
// 보관기간 표시용: YYYY-MM-DD → YYYY.MM.DD
const fmtDate = (d?: string | null) => (d ? d.replace(/-/g, '.') : '미정')

const CONTAINER_STATUS_KO: Record<string, string> = {
  AVAILABLE: '가용',
  OCCUPIED: '사용중',
  MAINTENANCE: '점검',
  RETIRED: '폐기',
}

export default function YardDispatchPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [slots, setSlots] = useState<YardSlot[]>([])
  const [containersById, setContainersById] = useState<Map<number, Container>>(new Map())
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [floorPrices, setFloorPrices] = useState<Map<number, { unitPrice: number; minFee: number }>>(new Map()) // 층 → 단가/최소료

  const [query, setQuery] = useState('')
  // [화주명 검색] 백엔드가 검증·매칭해 돌려준 하이라이트 대상 컨테이너 id 집합
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set())
  const [searching, setSearching] = useState(false)
  const [inboundSlot, setInboundSlot] = useState<YardSlot | null>(null)
  // [기존 예약계약 배치] 빈 자리를 눌렀을 때, 이 창고에 '입고일은 지났는데 아직 컨테이너가 없는'
  // 예약 계약이 있으면 새로 등록하지 않고 그 계약에 바로 이어 붙일 수 있도록 먼저 고르게 한다.
  //   (계약관리에서 미리 등록만 해둔 예약 계약은 원래 컨테이너 관리에서 자리를 배정하도록 안내하는데,
  //    지금까지는 그 경로가 없어 직원들이 매번 새 계약을 또 만들어 계약관리에 '입고 미배치'로 영영 남는
  //    중복 계약이 쌓이는 문제가 있었다 — 실제 보고된 버그)
  const [pendingSlot, setPendingSlot] = useState<YardSlot | null>(null)
  const [pendingCandidates, setPendingCandidates] = useState<StorageOrder[]>([])
  const [placingOrderId, setPlacingOrderId] = useState<number | null>(null)
  const [actionSlot, setActionSlot] = useState<YardSlot | null>(null)
  const [editSlot, setEditSlot] = useState<YardSlot | null>(null)
  const [billingOrder, setBillingOrder] = useState<StorageOrder | null>(null) // [통합] 정산 보기 — 계약관리와 동일한 정산 타임라인 팝업
  const [statusTarget, setStatusTarget] = useState<StorageOrder | null>(null) // [통합] 출고 처리 — 계약관리와 동일한 정상/중도 출고 선택 팝업
  const [emptyActionSlot, setEmptyActionSlot] = useState<YardSlot | null>(null) // 빈 자리 옵션 시트(입고/운영전환)
  const [dragging, setDragging] = useState<{ containerId: number; fromSlotId: number; label: string } | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<number | null>(null) // 모바일: 상단 탭에서 선택한 층
  // [미사용 일괄 관리] 모드 진입 시 팝업 없이 격자 터치만으로 여러 자리를 미사용↔사용 토글, 마지막에 한 번에 저장
  const [bulkMode, setBulkMode] = useState(false)
  const [pendingActive, setPendingActive] = useState<Map<number, boolean>>(new Map()) // slotId → 저장 대기 중인 active값(원래 값과 같으면 제거)
  const [bulkSaving, setBulkSaving] = useState(false)
  const isMobile = useIsMobile()

  const reload = () => setRefreshKey((k) => k + 1)

  // 창고를 바꾸면 이전 창고의 미저장 편집은 의미가 없으므로 정리한다 (저장 완료 시 정리는 handleBulkSave에서 별도 처리)
  useEffect(() => {
    setBulkMode(false)
    setPendingActive(new Map())
  }, [selectedId])

  // [안전장치] 편집 도중 다른 곳에서 해당 자리가 실제로 입고돼 버리면(다른 작업자·다른 탭)
  //   더 이상 미사용으로 지정할 수 없으므로 대기 중이던 변경을 조용히 취소한다.
  useEffect(() => {
    setPendingActive((prev) => {
      if (prev.size === 0) return prev
      const occupiedIds = new Set(slots.filter((s) => s.occupied).map((s) => s.id))
      let changed = false
      const next = new Map(prev)
      for (const id of prev.keys()) {
        if (occupiedIds.has(id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [slots])

  // 슬롯의 "저장하면 적용될" 사용 여부 — 편집 중 대기 변경이 있으면 그 값을, 없으면 서버 값을 사용
  function effectiveActive(slot: YardSlot): boolean {
    return pendingActive.get(slot.id) ?? slot.active !== false
  }

  // 편집 모드에서 빈 자리를 터치할 때마다 미사용↔사용 토글 (팝업 없음, 즉시 반영은 저장 시)
  function handleBulkToggle(slot: YardSlot) {
    if (slot.occupied) return // 이중 방어 — 버튼도 disabled 처리되어 있음
    setPendingActive((prev) => {
      const next = new Map(prev)
      const flipped = !effectiveActive(slot)
      const original = slot.active !== false
      if (flipped === original) next.delete(slot.id) // 원래 상태로 되돌아오면 변경 목록에서 제외
      else next.set(slot.id, flipped)
      return next
    })
  }

  async function handleBulkSave() {
    if (pendingActive.size === 0) {
      setBulkMode(false)
      return
    }
    setBulkSaving(true)
    try {
      const entries = [...pendingActive.entries()]
      await Promise.all(entries.map(([id, active]) => yardApi.setSlotActive(id, active)))
      setBanner(`자리 ${entries.length}곳의 운영 상태를 저장했습니다.`)
      setPendingActive(new Map())
      setBulkMode(false)
      reload()
    } catch (err) {
      alert(errMsg(err, '일부 자리 저장에 실패했습니다. 화면을 새로고침한 뒤 다시 시도하세요.'))
      reload() // 부분 성공/실패가 섞였을 수 있으니 서버 기준으로 다시 맞춘다
    } finally {
      setBulkSaving(false)
    }
  }

  function handleBulkCancel() {
    setPendingActive(new Map())
    setBulkMode(false)
  }

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

  useEffect(() => {
    if (selectedId == null) return
    setLoading(true)
    setError(null)
    // 창고 전환/새로고침 시 이전 하이라이트·질의는 초기화
    setMatchedIds(new Set())
    setQuery('')
    Promise.all([
      yardApi.slots(selectedId),
      containerApi.list({ warehouseId: selectedId }),
      customerApi.list().catch(() => [] as Customer[]),
      orderApi.list().catch(() => [] as StorageOrder[]),
      yardApi.floorPrices(selectedId).catch(() => [] as FloorPrice[]),
    ])
      .then(([sl, cs, cu, os, fp]) => {
        setSlots(sl)
        setContainersById(new Map(cs.map((c) => [c.id, c])))
        setCustomers(cu)
        setOrders(os)
        setFloorPrices(new Map(fp.map((p) => [p.tier, { unitPrice: p.unitPrice, minFee: p.minFee ?? 0 }])))
      })
      .catch(() => setError('보관창고 현황을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [selectedId, refreshKey])

  // [층별 단가] 저장 → 전체 리로드 없이 해당 층만 즉시 반영
  async function handleSaveFloorPrice(tier: number, unitPrice: number, minFee: number) {
    if (selectedId == null) return
    const saved = await yardApi.setFloorPrice({ warehouseId: selectedId, tier, unitPrice, minFee })
    setFloorPrices((prev) => new Map(prev).set(saved.tier, { unitPrice: saved.unitPrice, minFee: saved.minFee ?? 0 }))
  }

  // [실시간 동기화] 계약관리에서 상태 전환·삭제 시 슬롯/컨테이너를 다시 불러온다.
  useEffect(() => orderSync.subscribe(() => setRefreshKey((k) => k + 1)), [])

  // 배경 자동 갱신 전용 — 로딩 스피너·검색 상태(query/matchedIds)를 건드리지 않고 격자만 조용히 최신화한다.
  //   (전체 refreshKey 갱신은 검색어·하이라이트를 초기화하므로, 다른 작업자의 변경까지 그 경로로 반영하면
  //    현장에서 화주명을 검색해 놓은 상태가 1분마다 초기화되는 부작용이 생긴다)
  async function silentRefresh() {
    if (selectedId == null) return
    try {
      const [sl, cs, os] = await Promise.all([
        yardApi.slots(selectedId),
        containerApi.list({ warehouseId: selectedId }),
        orderApi.list().catch(() => [] as StorageOrder[]),
      ])
      setSlots(sl)
      setContainersById(new Map(cs.map((c) => [c.id, c])))
      setOrders(os)
    } catch {
      // 배경 갱신 실패는 조용히 무시 — 다음 주기에 재시도
    }
  }

  // [현장 자동 갱신] 다른 작업자가 입고·출고한 변경도 새로고침 없이 반영 (탭이 보일 때만, 계약관리와 동일 주기)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void silentRefresh()
    }, 60000)
    return () => clearInterval(id)
  }, [selectedId])

  const floors = useMemo(() => groupByFloor(slots), [slots])
  // 컨테이너에 연결된 계약(정산) 조회용 — 화주 카드에 보관기간·보관료를 매핑한다
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])

  /**
   * [컨테이너 관리 → 계약 수정 컨텍스트 결합]
   * 격자에서 고른 '자리'를 계약 수정 팝업이 이해하는 형태로 옮긴다.
   *   자리(slot) → 적재된 컨테이너(container) → 그 컨테이너가 물고 있는 계약(order)
   * 이 사슬이 끊긴 자리(배정 없는 컨테이너 등)는 수정할 계약이 없으므로 팝업을 열지 않는다.
   */
  const editTarget = useMemo(() => {
    if (!editSlot || editSlot.containerId == null) return null
    const container = containersById.get(editSlot.containerId)
    const order = container?.currentOrderId != null ? orderById.get(container.currentOrderId) : undefined
    if (!order) return null
    return {
      order,
      hint: { slotId: editSlot.id, locationLabel: editSlot.locationLabel, container },
    }
  }, [editSlot, containersById, orderById])
  const kpi = useMemo(() => {
    const total = slots.length
    const occupied = slots.filter((s) => s.occupied).length
    const inactive = slots.filter((s) => !s.occupied && s.active === false).length // 미사용(운영 중지)
    const vacant = total - occupied - inactive // 공실 = 사용 가능한 빈 자리
    return { total, occupied, vacant, inactive }
  }, [slots])

  // 백엔드가 반환한 매칭 컨테이너 id 집합에 속하면 하이라이트
  const matchSlot = (s: YardSlot) =>
    matchedIds.size > 0 && s.occupied && s.containerId != null && matchedIds.has(s.containerId)

  // [화주명 검색] 프론트 상태(질의) → 백엔드 검증 쿼리 → 매칭 id 집합 수신 → 하이라이트
  async function handleOwnerSearch(e: FormEvent) {
    e.preventDefault()
    if (selectedId == null) return
    const term = query.trim()
    if (term === '') {
      setMatchedIds(new Set())
      setBanner(null)
      return
    }
    setSearching(true)
    try {
      const ids = await containerApi.searchByOwner(selectedId, term)
      setMatchedIds(new Set(ids))
      setBanner(
        ids.length > 0
          ? `'${term}' 화주 컨테이너 ${ids.length}개를 찾았습니다.`
          : `'${term}' 화주 소유 컨테이너가 없습니다.`,
      )
    } catch {
      setBanner('화주명 검색에 실패했습니다.')
    } finally {
      setSearching(false)
    }
  }

  // 검색어를 비우면 하이라이트 즉시 해제
  function onQueryChange(v: string) {
    setQuery(v)
    if (v.trim() === '') setMatchedIds(new Set())
  }

  /* ===== 액션 ===== */
  // [통합] 출고 처리는 계약관리와 완전히 동일한 정상/중도 출고 선택 팝업(StatusChangeModal)을 쓴다.
  //   즉시 무조건 출고 처리하던 이전 방식은 정산 금액을 소급 반영하지 못해 제거했다.

  // [통합] 계약 삭제 — 계약 관리의 삭제와 동일 동작(청구 원장·입금 내역도 함께 삭제)
  async function handleDeleteContract(order: StorageOrder) {
    if (!window.confirm(`'${order.customerName}' 계약을 삭제할까요?\n(연결된 정산서·입금 내역도 함께 삭제됩니다)`)) return
    try {
      await orderApi.remove(order.id)
      setActionSlot(null)
      setBanner(`'${order.customerName}' 계약을 삭제했습니다.`)
      reload()
      orderSync.emit() // 계약관리·캘린더·대시보드에 삭제 전파
    } catch (err) {
      alert(errMsg(err, '계약 삭제에 실패했습니다.'))
    }
  }

  // 드래그로 적재 컨테이너를 빈 슬롯에 떨어뜨려 이동
  async function handleDropMove(targetSlot: YardSlot) {
    const drag = dragging
    setDragging(null)
    if (!drag || targetSlot.occupied || targetSlot.id === drag.fromSlotId) return
    try {
      await containerApi.move({ containerId: drag.containerId, targetSlotId: targetSlot.id })
      setBanner(`${drag.label} → ${targetSlot.locationLabel} 이동 완료`)
      reload()
    } catch (err) {
      alert(errMsg(err, '이동에 실패했습니다.'))
    }
  }

  // [빈 자리 입고 진입] 이 창고에 입고일 지난 미배치 예약 계약이 있으면 먼저 골라보게 하고,
  //   없으면 지금까지처럼 바로 새 계약 등록 팝업으로 직행한다(흔한 경우의 절차를 늘리지 않는다).
  function openInboundFlow(slot: YardSlot) {
    const linkedOrderIds = new Set(
      [...containersById.values()].map((c) => c.currentOrderId).filter((id): id is number => id != null),
    )
    const candidates = orders.filter(
      (o) =>
        o.warehouseId === selectedId &&
        o.status === 'INBOUND' &&
        o.storageStartDate <= today() &&
        !linkedOrderIds.has(o.id),
    )
    if (candidates.length === 0) {
      setInboundSlot(slot)
      return
    }
    setPendingCandidates(candidates)
    setPendingSlot(slot)
  }

  // [기존 예약계약 배치] 골라둔 계약을 이 자리에 컨테이너 생성·배정·적재까지 이어서 처리
  async function handlePlaceExisting(order: StorageOrder, slot: YardSlot) {
    setPlacingOrderId(order.id)
    try {
      await placeContainerAtSlot(order.id, order.warehouseId, slot.id, {
        customerName: order.customerName,
        inboundDate: order.storageStartDate,
        outboundDate: order.expectedEndDate ?? undefined,
      })
      orderSync.emit() // 계약관리의 '입고 미배치' 배너가 이 신호로 즉시 해제된다
      setPendingSlot(null)
      setPendingCandidates([])
      setBanner('입고 배치 완료')
      reload()
    } catch (e) {
      window.alert(`배치에 실패했습니다.\n(${errMsg(e, '원인 미상')})`)
    } finally {
      setPlacingOrderId(null)
    }
  }

  // [운영 상태] 빈 자리를 미사용(운영 중지) ↔ 사용 으로 전환
  async function handleToggleActive(slot: YardSlot, active: boolean) {
    try {
      await yardApi.setSlotActive(slot.id, active)
      setBanner(active ? `${slot.locationLabel} 다시 사용 설정` : `${slot.locationLabel} 미사용(운영 중지) 처리`)
      reload()
    } catch (err) {
      alert(errMsg(err, '운영 상태 변경에 실패했습니다.'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">컨테이너 관리</h2>
          {bulkMode && (
            <p className="mt-0.5 text-sm text-slate-500">빈 자리를 눌러 미사용 지정을 켜고 끄세요. 다 고르면 저장을 누르세요.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
          {selectedId != null && (
            bulkMode ? (
              <>
                <button
                  type="button"
                  onClick={handleBulkCancel}
                  disabled={bulkSaving}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleBulkSave}
                  disabled={bulkSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
                >
                  {bulkSaving ? '저장 중…' : pendingActive.size > 0 ? `저장 (${pendingActive.size}곳)` : '완료'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDragging(null) // 이동 모드와 동시 진행 방지
                  setBulkMode(true)
                }}
                className="flex items-center gap-1.5 rounded-lg border-2 border-red-300 bg-red-50 px-3.5 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
              >
                <Ban size={16} /> 미사용 컨테이너 관리
              </button>
            )
          )}
          {/* 자리 생성 버튼 (모바일·데스크톱 공통 · 상단) */}
          {isAdmin && selectedId != null && !bulkMode && (
            <button
              type="button"
              onClick={() => setGridOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              <Plus size={16} /> 자리 생성
            </button>
          )}
        </div>
      </div>

      {/* 편집 모드 안내 띠 — 화면에 얇게 둘러 "지금은 일반 조회가 아니라 편집 중"임을 계속 인지시킨다 */}
      {bulkMode && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          미사용 관리 모드 — 사용 중인 자리는 눌러도 반응하지 않습니다.
        </div>
      )}

      {/* 창고 탭 + 검색 */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={bulkMode && w.id !== selectedId}
              title={bulkMode && w.id !== selectedId ? '미사용 관리 모드를 완료하거나 취소한 뒤 창고를 바꿀 수 있습니다.' : undefined}
              onClick={() => {
                setSelectedId(w.id)
                setDragging(null)
              }}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                w.id === selectedId
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {w.name}
            </button>
          ))}
        </div>
        <form onSubmit={handleOwnerSearch} className="flex w-full gap-2 sm:max-w-md">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="고객명(화주명) 검색 · 조회 시 하이라이트"
              className={cn(inputCls, 'pl-9')}
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {searching ? '조회 중…' : '조회'}
          </button>
        </form>
      </div>

      {banner && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700">
          <span>{banner}</span>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="text-indigo-400 hover:text-indigo-600"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <Grid3x3 size={28} className="text-slate-300" />
          <p className="mt-3 text-lg font-bold text-slate-700">아직 컨테이너 자리가 없습니다</p>
          {isAdmin && selectedId != null ? (
            <>
              <p className="mt-1.5 text-sm text-slate-500">아래 버튼을 눌러 층별 자리를 만드세요.</p>
              <button
                type="button"
                onClick={() => setGridOpen(true)}
                className="mt-5 flex items-center gap-2 rounded-2xl bg-indigo-600 px-7 py-4 text-lg font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-[0.99]"
              >
                <Plus size={20} /> 자리 생성
              </button>
            </>
          ) : (
            <p className="mt-1.5 text-sm text-slate-400">
              {isAdmin ? '먼저 위에서 창고를 선택하세요.' : '관리자가 자리를 생성하면 표시됩니다.'}
            </p>
          )}
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <>
          {/* 모바일: 가로 4칸 요약 (총/사용중/공실/미사용) */}
          <div className="grid grid-cols-4 gap-1.5 md:hidden">
            <YardStat label="전체" value={kpi.total} />
            <YardStat label="사용중" value={kpi.occupied} />
            <YardStat label="공실" value={kpi.vacant} />
            <YardStat label="미사용" value={kpi.inactive} />
          </div>
          {/* 데스크톱: StatCard (검정 톤 통일) */}
          <div className="hidden gap-4 md:grid md:grid-cols-4">
            <StatCard label="총 컨테이너" value={fmt(kpi.total)} icon={Grid3x3} tone="slate" />
            <StatCard label="사용중" value={fmt(kpi.occupied)} icon={Boxes} tone="slate" />
            <StatCard label="공실" value={fmt(kpi.vacant)} icon={Square} tone="slate" />
            <StatCard label="미사용" value={fmt(kpi.inactive)} icon={Ban} tone="slate" />
          </div>

          <section
            className={cn(
              'rounded-2xl bg-white p-3 shadow-soft ring-1 sm:p-6 transition-shadow',
              bulkMode ? 'ring-2 ring-red-300' : 'ring-slate-200/60',
            )}
          >
            <div className="mb-2 flex items-center justify-end">
              <Legend />
            </div>

            {(() => {
              // 층 하나의 셀 묶음 렌더 (모바일·데스크톱 공용)
              const renderCells = (cells: YardSlot[]) => (
                <div className="flex flex-wrap gap-1.5">
                  {cells.map((s) => (
                    <SlotCell
                      key={s.id}
                      slot={s}
                      container={s.containerId != null ? containersById.get(s.containerId) : undefined}
                      highlighted={matchSlot(s)}
                      dragActive={!bulkMode && dragging != null}
                      isDragSource={dragging?.fromSlotId === s.id}
                      bulkMode={bulkMode}
                      effectiveInactive={!effectiveActive(s)}
                      onClick={() => {
                        if (bulkMode) return handleBulkToggle(s)
                        if (s.occupied) return setActionSlot(s)
                        // 빈 자리는 운영 중지 상태일 때만 옵션 시트(재사용 전환)를 거치고,
                        // 정상 빈 자리는 옵션 없이 바로 계약 등록 팝업으로 직행한다.
                        return s.active === false ? setEmptyActionSlot(s) : openInboundFlow(s)
                      }}
                      onDragStartCell={() => {
                        if (bulkMode) return
                        if (s.occupied && s.containerId != null) {
                          setDragging({
                            containerId: s.containerId,
                            fromSlotId: s.id,
                            label: s.ownerName ?? s.containerNo ?? '컨테이너',
                          })
                        }
                      }}
                      onDropCell={() => handleDropMove(s)}
                      onDragEndCell={() => setDragging(null)}
                    />
                  ))}
                </div>
              )

              // ===== 모바일: 상단 층 탭 + 선택한 층만 표시 (페이지 전환) =====
              if (isMobile) {
                const activeFloor = floors.find((f) => f.tier === selectedTier) ?? floors[0]
                return (
                  <div className="space-y-2.5">
                    {/* 이동 모드 안내 */}
                    {dragging && (
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
                        <span className="min-w-0 truncate">「{dragging.label}」 이동 중 · 빈 자리를 누르세요</span>
                        <button type="button" onClick={() => setDragging(null)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600">취소</button>
                      </div>
                    )}

                    {/* 상단 층 선택 탭 (크게) — 누르면 그 층만 보임 */}
                    {/* [클리핑 방지] overflow-x-auto가 있으면 브라우저가 overflow-y도 auto로 취급해,
                        굵은 글자의 위쪽 획이 박스 위 여백이 없으면 잘려 보인다 — pt로 여유를 준다 */}
                    <div className="flex gap-2 overflow-x-auto pt-1.5 pb-1">
                      {floors.map((f) => {
                        const used = f.cells.filter((cell) => cell.occupied).length
                        const active = f.tier === activeFloor?.tier
                        return (
                          <button
                            key={f.tier}
                            type="button"
                            onClick={() => setSelectedTier(f.tier)}
                            className={cn(
                              'flex min-w-[4.5rem] flex-1 flex-col items-center rounded-2xl py-2 transition active:scale-[0.98]',
                              // [혼동 방지] 아래 컨테이너 칸의 '사용중' 색(파랑)과 겹치지 않도록 층 탭은 짙은 슬레이트 톤을 쓴다
                              active ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 ring-1 ring-slate-200',
                            )}
                          >
                            <span className="text-lg font-extrabold">{f.tier}층</span>
                            <span className={cn('text-xs font-semibold', active ? 'text-white/80' : 'text-slate-400')}>{used}/{f.cells.length}</span>
                          </button>
                        )
                      })}
                    </div>

                    {/* 선택한 층의 격자 — 화면 폭과 무관하게 한 줄 5칸 고정. 상세는 탭하면 하단 시트로. */}
                    {activeFloor && (
                      <div className="grid grid-cols-5 gap-2.5">
                        {activeFloor.cells.map((s) => (
                          <MobileSlotTile
                            key={s.id}
                            slot={s}
                            container={s.containerId != null ? containersById.get(s.containerId) : undefined}
                            highlighted={matchSlot(s)}
                            dragging={!bulkMode && dragging != null}
                            bulkMode={bulkMode}
                            effectiveInactive={!effectiveActive(s)}
                            onClick={() => {
                              if (bulkMode) return handleBulkToggle(s)
                              if (s.occupied) return setActionSlot(s)
                              if (dragging) return handleDropMove(s)
                              // 빈 자리는 운영 중지 상태일 때만 옵션 시트(재사용 전환)를 거치고,
                              // 정상 빈 자리는 옵션 없이 바로 계약 등록 팝업으로 직행한다.
                              return s.active === false ? setEmptyActionSlot(s) : openInboundFlow(s)
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              }

              // ===== 데스크톱: 전 층 세로 나열 (기존 방식) =====
              return (
                <div className="space-y-6">
                  {floors.map(({ tier, cells }) => (
                    <div key={tier} className="relative">
                      <p className="mb-2 text-sm font-medium text-slate-700">
                        {tier}층 <span className="text-xs font-normal text-slate-400">· {cells.length}칸</span>
                      </p>
                      {/* 층 컨테이너 우측에 절대 고정 → 모든 층 배지의 우측 끝이 정확히 일치 */}
                      <div className="absolute right-0 top-0">
                        <FloorPriceInline
                          tier={tier}
                          price={floorPrices.get(tier) ?? null}
                          editable={isAdmin}
                          onSave={(u, m) => handleSaveFloorPrice(tier, u, m)}
                        />
                      </div>
                      {renderCells(cells)}
                    </div>
                  ))}
                </div>
              )
            })()}
          </section>
        </>
      )}

      {/* 운영 중지(미사용) 빈 자리 전용 시트 — 정상 빈 자리는 옵션 없이 바로 계약 등록으로 직행하므로
          이 시트는 재사용 전환 안내만 남는다 (모바일 바텀시트) */}
      {emptyActionSlot && (
        <Modal open onClose={() => setEmptyActionSlot(null)} title={`${emptyActionSlot.locationLabel} 자리`}>
          <div className="space-y-3">
            <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600">
              이 자리는 <b className="text-slate-800">미사용(운영 중지)</b> 상태예요. 입고 대상에서 제외됩니다.
            </p>
            <button
              type="button"
              onClick={() => {
                const s = emptyActionSlot
                setEmptyActionSlot(null)
                handleToggleActive(s, true)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-lg font-bold text-white transition active:scale-[0.99]"
            >
              다시 사용하기
            </button>
          </div>
        </Modal>
      )}

      {/* [기존 예약계약 배치] 빈 자리 입고 시, 입고일 지난 미배치 예약 계약이 있으면 먼저 고르게 한다.
          여기서 하나를 고르면 새 계약을 또 만들지 않고 그 계약에 바로 컨테이너를 배정·적재한다. */}
      {pendingSlot && (
        <Modal open onClose={() => { setPendingSlot(null); setPendingCandidates([]) }} title={`${pendingSlot.locationLabel} 자리 입고`}>
          <div className="space-y-3">
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              입고일이 지났지만 아직 자리를 배정받지 못한 예약 계약이 있어요. 지금 입고하는 컨테이너가 그 계약 것이라면
              새로 등록하지 말고 아래에서 골라 이어주세요.
            </p>
            <div className="space-y-2">
              {pendingCandidates.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={placingOrderId != null}
                  onClick={() => handlePlaceExisting(o, pendingSlot)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-bold text-slate-800">{o.customerName}</span>
                    <span className="block text-xs text-slate-500">보관 시작 {fmtDate(o.storageStartDate)}</span>
                  </span>
                  {placingOrderId === o.id ? (
                    <Loader2 size={16} className="animate-spin text-indigo-500" />
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-indigo-600">이 계약에 배치</span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={placingOrderId != null}
              onClick={() => {
                setInboundSlot(pendingSlot)
                setPendingSlot(null)
                setPendingCandidates([])
              }}
              className="w-full rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700 disabled:opacity-50"
            >
              해당 없음 · 새 계약으로 등록
            </button>
          </div>
        </Modal>
      )}

      {/* 계약 등록(통합) — 컨테이너 관리 입고: 선택한 창고·자리 자동 고정(변경 불가) */}
      {inboundSlot && selectedId != null && (
        <CreateOrderModal
          open
          fixedSlot={inboundSlot}
          customers={customers}
          warehouses={warehouses}
          onCustomerAdded={(c) =>
            setCustomers((prev) => {
              const i = prev.findIndex((x) => x.id === c.id)
              if (i >= 0) {
                const next = [...prev]
                next[i] = c
                return next
              }
              return [...prev, c]
            })
          }
          onClose={() => setInboundSlot(null)}
          onDone={() => {
            setInboundSlot(null)
            setBanner('입고 배치 완료')
            orderSync.emit() // 계약관리·대시보드 등 다른 화면에도 새 계약·배치를 전파
            reload()
          }}
        />
      )}

      {/* 적재 슬롯 액션 패널 */}
      {actionSlot && (() => {
        const actionContainer = actionSlot.containerId != null ? containersById.get(actionSlot.containerId) : undefined
        const actionOrder = actionContainer?.currentOrderId != null ? orderById.get(actionContainer.currentOrderId) : undefined
        return (
          <ActionPanel
            slot={actionSlot}
            container={actionContainer}
            order={actionOrder}
            isAdmin={isAdmin}
            onClose={() => setActionSlot(null)}
            onOutbound={() => {
              if (actionOrder) setStatusTarget(actionOrder)
              setActionSlot(null)
            }}
            onMove={() => {
              const s = actionSlot
              if (s?.containerId != null) {
                setDragging({
                  containerId: s.containerId,
                  fromSlotId: s.id,
                  label: s.ownerName ?? s.containerNo ?? '컨테이너',
                })
              }
              setActionSlot(null)
            }}
            onEdit={() => {
              setEditSlot(actionSlot)
              setActionSlot(null)
            }}
            onBilling={() => {
              if (actionOrder) setBillingOrder(actionOrder)
              setActionSlot(null)
            }}
            onDelete={() => {
              if (actionOrder) handleDeleteContract(actionOrder)
            }}
          />
        )
      })()}

      {/* [통합] 정산 보기 — 계약 관리의 '정산' 과 완전히 동일한 팝업 */}
      <OrderBillingModal target={billingOrder} isAdmin={isAdmin} onClose={() => setBillingOrder(null)} />

      {/* [통합] 출고 처리 — 계약 관리의 '출고'와 완전히 동일한 정상/중도 출고 선택 팝업 */}
      <StatusChangeModal
        target={statusTarget}
        onClose={() => setStatusTarget(null)}
        onDone={(updated) => {
          setStatusTarget(null)
          setBanner(`${updated.customerName} 출고 처리 완료`)
          reload()
          orderSync.emit() // 계약관리·캘린더·대시보드에 전파
        }}
      />

      {/*
        [통합] 계약 수정 — 계약 관리의 '수정'과 완전히 동일한 팝업을 띄운다.
        격자에서 이미 아는 자리·컨테이너를 hint 로 넘겨 조회 대기 없이 즉시 바인딩한다.
      */}
      {editTarget && (
        <EditOrderModal
          target={editTarget.order}
          hint={editTarget.hint}
          onClose={() => setEditSlot(null)}
          /* 격자 재조회는 EditOrderModal 이 emit 하는 orderSync 구독으로 자동 처리된다 */
          onDone={() => {
            setEditSlot(null)
            setBanner('계약 수정 완료')
          }}
        />
      )}

      {/* 구역 생성 */}
      {gridOpen && selectedId != null && (
        <GridModal
          warehouseId={selectedId}
          onClose={() => setGridOpen(false)}
          onDone={() => {
            setGridOpen(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

/* ===== 슬롯 셀 =====
 * 적재 슬롯은 draggable — 빈 슬롯 위로 끌어다 놓으면 이동 처리된다.
 * 드래그 중엔 빈 슬롯이 드롭 타겟(초록 점선)으로 강조된다.
 */
function SlotCell({
  slot,
  container,
  highlighted,
  dragActive,
  isDragSource,
  bulkMode,
  effectiveInactive,
  onClick,
  onDragStartCell,
  onDropCell,
  onDragEndCell,
}: {
  slot: YardSlot
  container?: Container
  highlighted: boolean
  dragActive: boolean
  isDragSource: boolean
  bulkMode: boolean
  effectiveInactive: boolean // 미사용 일괄 편집 중 대기 변경까지 반영한 최종 상태
  onClick: () => void
  onDragStartCell: () => void
  onDropCell: () => void
  onDragEndCell: () => void
}) {
  const owner = slot.ownerName
  const inactive = !slot.occupied && effectiveInactive // 미사용(운영 중지) — 저장 전 대기 상태 포함
  const bulkLocked = bulkMode && slot.occupied // 편집 모드에선 사용 중인 자리는 절대 터치 불가
  const cellLabel = slot.occupied ? (owner ?? slot.containerNo ?? `${slot.tier}층`) : ''
  const dropTarget = dragActive && !slot.occupied && !inactive // 미사용 자리는 이동 대상 불가
  const tooltip = bulkLocked
    ? `${slot.locationLabel} · 사용 중 — 편집 모드에서는 변경 불가`
    : slot.occupied
      ? [
          owner ? `화주 ${owner}` : null,
          `번호 ${slot.containerNo}`,
          container ? `용량 ${container.capacityTon}톤` : null,
          container?.inboundDate ? `입고일 ${container.inboundDate}` : null,
          container?.expectedOutboundDate ? `출고예정 ${container.expectedOutboundDate}` : null,
          '끌어서 빈 슬롯으로 이동',
        ]
          .filter(Boolean)
          .join('\n')
      : bulkMode
        ? `${slot.locationLabel} · 눌러서 미사용 지정 ${inactive ? '해제' : '켜기'}`
        : inactive
          ? `${slot.locationLabel} · 미사용(운영 중지) — 클릭해 관리`
          : `${slot.locationLabel} · 빈 슬롯 (클릭해 관리)`

  return (
    <button
      type="button"
      draggable={slot.occupied && !bulkMode}
      disabled={bulkLocked}
      onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(slot.id))
        onDragStartCell()
      }}
      onDragOver={(e) => {
        if (dropTarget) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(e) => {
        if (dropTarget) {
          e.preventDefault()
          onDropCell()
        }
      }}
      onDragEnd={onDragEndCell}
      title={tooltip}
      className={cn(
        // [프리미엄 타일] 라운드 + 은은한 그라데이션 + 소프트 섀도 + 호버 리프트 (금융 앱 타일 감성)
        'relative flex h-9 w-16 items-center justify-center rounded-lg text-[11px] font-medium',
        'transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out',
        bulkLocked
          ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 opacity-60'
          : slot.occupied
            ? 'cursor-grab bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_rgba(43,51,63,0.18)] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(43,51,63,0.22)] active:translate-y-0 active:cursor-grabbing'
            : inactive
              ? 'cursor-pointer border-2 border-slate-400 bg-slate-200 text-slate-500 hover:bg-slate-300'
              : dropTarget
                ? 'border-2 border-dashed border-[#5C7C6B] bg-[#E9EFEA] text-[#5C7C6B]'
                : 'border border-dashed border-slate-200 bg-slate-50/60 text-slate-300 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:text-indigo-500 hover:shadow-[0_4px_12px_rgba(43,51,63,0.08)]',
        isDragSource && 'opacity-40',
        // [선택 강조] 브래스 링 — 화면당 한 번의 포인트
        highlighted && 'animate-pulse ring-2 ring-[#B08D57] ring-offset-1',
      )}
    >
      {slot.occupied ? (
        <span className="truncate px-1">{cellLabel}</span>
      ) : (
        <span className="text-slate-400">{slot.columnNo}</span>
      )}
      {/* 미사용 지정 — 블록 전체를 덮는 X 레이어 (편집 중 대기 상태도 즉시 반영) */}
      {inactive && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-slate-600/70">
          <X size={16} strokeWidth={3} className="text-white" />
        </div>
      )}
    </button>
  )
}

/**
 * 모바일 전용 격자 타일 — 화면 폭과 무관하게 한 줄에 정확히 5칸(부모의 grid-cols-5)이
 * 놓이도록 정사각형으로 고정한다. 노안 사용자를 위해 상세 텍스트 대신 상태색 + 큰 숫자만
 * 담고, 나머지 정보(화주·기간·보관료)는 탭 한 번으로 열리는 하단 시트(ActionPanel)에 둔다.
 */
function MobileSlotTile({
  slot,
  container,
  highlighted,
  dragging,
  bulkMode,
  effectiveInactive,
  onClick,
}: {
  slot: YardSlot
  container?: Container
  highlighted: boolean
  dragging: boolean
  bulkMode: boolean
  effectiveInactive: boolean // 미사용 일괄 편집 중 대기 변경까지 반영한 최종 상태
  onClick: () => void
}) {
  const inactive = !slot.occupied && effectiveInactive
  const maint = container?.status === 'MAINTENANCE'
  const dropTarget = dragging && !slot.occupied && !inactive
  const bulkLocked = bulkMode && slot.occupied // 편집 모드에선 사용 중인 자리는 절대 터치 불가 — 톤다운 + 비활성화

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={bulkLocked || (dragging && inactive)} // 이동 모드에선 미사용 자리는 타겟이 될 수 없다 (데스크톱 격자와 동일 규칙)
      title={
        bulkLocked
          ? `${slot.locationLabel} · 사용 중 — 편집 모드에서는 변경 불가`
          : slot.occupied
            ? `${slot.locationLabel} · ${slot.ownerName ?? '사용중'}`
            : bulkMode
              ? `${slot.locationLabel} · 눌러서 미사용 지정 ${inactive ? '해제' : '켜기'}`
              : inactive
                ? `${slot.locationLabel} · 미사용(운영 중지)`
                : `${slot.locationLabel} · 빈 자리`
      }
      className={cn(
        'relative flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 text-center transition active:scale-95 disabled:opacity-50',
        bulkLocked
          ? 'border-slate-300 bg-slate-200 text-slate-400'
          : slot.occupied
            ? maint
              ? 'border-amber-600 bg-amber-500 text-white shadow-sm'
              : 'border-indigo-700 bg-indigo-600 text-white shadow-sm'
            : inactive
              ? 'border-slate-400 bg-slate-300 text-slate-600'
              : dropTarget
                ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                : 'border-dashed border-slate-300 bg-slate-50 text-slate-400',
        highlighted && 'ring-4 ring-[#B08D57] ring-offset-1',
      )}
    >
      {slot.occupied ? (
        <>
          {/* 자리 번호 + 화주명을 한 블록으로 묶어 칸 정중앙에 정렬 (길어도 겹치지 않게 일반 흐름으로 배치) */}
          <span className="shrink-0 text-center text-[11px] font-bold leading-none opacity-80 tabular-nums">
            {slot.columnNo}번
          </span>
          <span className="line-clamp-2 max-w-full break-words px-1.5 text-center text-xs font-extrabold leading-tight">
            {slot.ownerName ?? container?.containerNo ?? '—'}
          </span>
          {maint && !bulkLocked && (
            <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-bold leading-none opacity-80">점검</span>
          )}
        </>
      ) : (
        <>
          <span className="text-lg font-extrabold leading-none tabular-nums">{slot.columnNo}</span>
          <span className="text-[10px] font-bold leading-none opacity-80">{dropTarget ? '이동' : '공실'}</span>
        </>
      )}
      {/* 미사용 지정 — 블록 전체를 덮는 큼직한 X 레이어. 편집 모드에서 탭할 때마다 즉시 켜지고 꺼진다. */}
      {inactive && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-600/75">
          <X size={32} strokeWidth={3} className="text-white" />
        </div>
      )}
    </button>
  )
}

/* ===== 적재 슬롯 액션 패널 ===== */
function ActionPanel({
  slot,
  container,
  order,
  isAdmin,
  onClose,
  onOutbound,
  onMove,
  onEdit,
  onBilling,
  onDelete,
}: {
  slot: YardSlot
  container?: Container
  order?: StorageOrder
  isAdmin: boolean
  onClose: () => void
  onOutbound: () => void
  onMove: () => void
  onEdit: () => void
  onBilling: () => void
  onDelete: () => void
}) {
  const isMobile = useIsMobile()
  const start = order?.storageStartDate ?? container?.inboundDate
  const end = order?.actualEndDate ?? order?.expectedEndDate ?? container?.expectedOutboundDate
  const fee = order?.monthlyFee
  return (
    <Modal open onClose={onClose} title={`${slot.ownerName ?? '컨테이너'} · ${slot.locationLabel}`}>
      <div className="space-y-3">
        <dl className="grid grid-cols-2 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-slate-400">화주(고객)</dt>
            <dd className="font-semibold text-slate-800">{slot.ownerName ?? '—'}</dd>
          </div>
          <Info label="보관기간">{start ? `${fmtDate(start)} ~ ${fmtDate(end)}` : '—'}</Info>
          <Info label="보관료">{fee != null ? `${fmt(fee)}원` : '—'}</Info>
          <Info label="용량">{container ? `${container.capacityTon}톤` : '—'}</Info>
          <Info label="상태">{container ? (CONTAINER_STATUS_KO[container.status] ?? container.status) : '—'}</Info>
          <div className="col-span-2">
            <dt className="text-xs text-slate-400">특이사항</dt>
            <dd className="text-slate-700">{stripOwnerTag(container?.memo) || '—'}</dd>
          </div>
        </dl>

        {/* 데스크톱은 드래그로 이동, 모바일은 아래 '다른 자리로 이동' 버튼 사용 */}
        {!isMobile && (
          <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <ArrowRightLeft size={13} /> 이동은 맵에서 컨테이너를 빈 슬롯으로 <b>드래그</b>하세요.
          </p>
        )}

        <button
          type="button"
          onClick={onOutbound}
          disabled={!order}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-base font-bold text-white transition hover:bg-amber-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-amber-500"
        >
          <LogOut size={18} /> 출고
        </button>
        {isMobile && (
          <button
            type="button"
            onClick={onMove}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-base font-bold text-white transition active:scale-[0.99]"
          >
            <ArrowRightLeft size={18} /> 다른 자리로 이동
          </button>
        )}
        {/*
          [통합] 계약 관리의 '수정'과 동일한 팝업을 연다.
          계약이 연결되지 않은 컨테이너는 고칠 원장이 없으므로 눌리지 않게 막고 이유를 밝힌다
          (누르고 아무 일도 안 일어나는 것이 현장에서 가장 혼란스럽다).
        */}
        <button
          type="button"
          onClick={onBilling}
          disabled={!order}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-bold text-white transition hover:bg-emerald-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wallet size={18} /> 정산 보기
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={!order}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3.5 text-base font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <Pencil size={18} /> 계약 수정
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={onDelete}
            disabled={!order}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-base font-semibold text-red-600 transition hover:bg-red-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-50"
          >
            <Trash2 size={18} /> 계약 삭제
          </button>
        )}
        {!order && (
          <p className="text-center text-xs text-slate-400">계약에 배정되지 않은 컨테이너라 출고·정산·수정·삭제할 계약 정보가 없습니다.</p>
        )}
      </div>
    </Modal>
  )
}

/* ===== 자리 생성 (층별) ===== */
function GridModal({
  warehouseId,
  onClose,
  onDone,
}: {
  warehouseId: number
  onClose: () => void
  onDone: () => void
}) {
  // 인덱스 = 층-1, 값 = 그 층의 자리 개수
  const [counts, setCounts] = useState<string[]>(['10', '10', '10'])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const total = counts.reduce((sum, c) => sum + (Number(c) || 0), 0)

  function setCount(i: number, v: string) {
    setCounts((prev) => prev.map((c, idx) => (idx === i ? v : c)))
  }
  function addFloor() {
    setCounts((prev) => [...prev, '10'])
  }
  function removeFloor(i: number) {
    setCounts((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const floors = counts
      .map((c, i) => ({ tier: i + 1, count: Number(c) || 0 }))
      .filter((f) => f.count > 0)
    if (floors.length === 0) {
      setFormError('층별 자리 개수를 1 이상 입력하세요.')
      return
    }
    if (!window.confirm('이 창고의 기존 자리와 컨테이너가 모두 삭제되고 새 층별 체계로 다시 생성됩니다. 계속할까요?')) {
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      await yardApi.generateFloors({ warehouseId, floors })
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '생성에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="보관창고 자리 생성 (층별)">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          층마다 자리 개수를 지정합니다. 자리 이름은 <b>"1층-15"</b>처럼 <b>층-번호</b>로 매겨집니다.
          재생성 시 <b>비어있는 기존 자리</b>는 정리되고 새로 만들어집니다. (적재된 자리는 유지)
        </p>

        <div className="space-y-2">
          {counts.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-sm font-medium text-slate-700">{i + 1}층</span>
              <input
                type="number"
                min={0}
                value={c}
                onChange={(e) => setCount(i, e.target.value)}
                className={cn(inputCls, 'flex-1')}
                placeholder="자리 개수"
              />
              <span className="shrink-0 text-xs text-slate-400">칸</span>
              {counts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeFloor(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  title="이 층 삭제"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addFloor}
          className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Plus size={14} /> 층 추가
        </button>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          총 <span className="font-semibold text-slate-700">{total}</span>칸 생성
        </p>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '생성 중…' : '생성'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== 소품/유틸 ===== */
function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-slate-700">{children}</dd>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-slate-500">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-gradient-to-b from-indigo-500 to-indigo-600" /> 적재중
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-dashed border-slate-200 bg-slate-50" /> 공실
      </span>
    </div>
  )
}

/* ===== 층 레이블 옆 인라인 단가 설정 =====
 * 화면 이동/모달 없이 층 레이블 옆에서 바로 단가를 보고 수정한다.
 * 저장은 비동기(층 메타 1행 upsert) — 완료 후 해당 층 칩만 즉시 갱신된다.
 */
function FloorPriceInline({
  tier,
  price,
  editable,
  onSave,
}: {
  tier: number
  price: { unitPrice: number; minFee: number } | null
  editable: boolean
  onSave: (unitPrice: number, minFee: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [unit, setUnit] = useState<number | null>(price?.unitPrice ?? null)
  const [min, setMin] = useState<number | null>(price?.minFee ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setUnit(price?.unitPrice ?? null)
    setMin(price?.minFee ?? null)
  }, [price])

  async function save() {
    if (unit == null || unit < 0) return
    setSaving(true)
    try {
      await onSave(unit, min ?? 0)
      setEditing(false)
    } catch {
      // 저장 실패 시 편집 상태 유지
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const hasMin = price?.minFee != null && price.minFee > 0
    return (
      <button
        type="button"
        onClick={() => editable && setEditing(true)}
        disabled={!editable}
        title={editable ? `${tier}층 단가·최소 보관료 설정` : undefined}
        className={cn(
          'group inline-flex w-[16.5rem] shrink-0 items-center justify-end gap-2 whitespace-nowrap rounded-lg border px-3 py-1 text-xs font-medium shadow-sm transition-all duration-200',
          price != null
            ? 'border-indigo-200/70 bg-indigo-50 text-indigo-700'
            : 'border-slate-200/70 bg-white text-slate-400',
          editable && 'hover:-translate-y-px hover:border-indigo-300 hover:shadow-md active:translate-y-0',
        )}
      >
        {price != null ? (
          <span className="flex items-baseline gap-1.5">
            <span className="flex items-baseline gap-1">
              <span className="text-[10px] font-normal uppercase tracking-wide text-indigo-400">기본</span>
              <span className="tabular-nums font-semibold text-indigo-700">{fmt(price.unitPrice)}원</span>
              <span className="text-[10px] font-normal text-indigo-400">/ 일</span>
            </span>
            {hasMin && (
              <span className="flex items-baseline gap-1 border-l border-indigo-200 pl-1.5">
                <span className="text-[10px] font-normal uppercase tracking-wide text-indigo-400">최소</span>
                <span className="tabular-nums font-semibold text-indigo-700">{fmt(price.minFee)}원</span>
              </span>
            )}
          </span>
        ) : (
          <span>단가 미설정</span>
        )}
        {editable && (
          <Pencil size={11} className="text-slate-300 transition-colors duration-200 group-hover:text-indigo-500" />
        )}
      </button>
    )
  }

  const miniInput = 'w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
  return (
    <span className="inline-flex items-center gap-1.5">
      <label className="flex items-center gap-1 text-[11px] text-slate-500">
        기본
        <MoneyInput value={unit} onChange={setUnit} placeholder="6,000" className={miniInput} />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-slate-500">
        최소
        <MoneyInput value={min} onChange={setMin} placeholder="0" className={miniInput} />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {saving ? '…' : '저장'}
      </button>
      <button
        type="button"
        onClick={() => {
          setUnit(price?.unitPrice ?? null)
          setMin(price?.minFee ?? null)
          setEditing(false)
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
      >
        취소
      </button>
    </span>
  )
}

/* 계좌이체 시 입금 계좌(담당 직원) 지정 — 직원 정보에 등록된 계좌를 선택만으로 매핑 */

// 층(tier)별로 묶어 높은 층이 위로, 각 층은 자리 번호(columnNo) 오름차순
/* 모바일 가로 요약 카드 — 큰 숫자 + 작은 라벨 */
function YardStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-2.5 text-center shadow-soft ring-1 ring-slate-200/60">
      <p className="text-3xl font-extrabold leading-none text-slate-900">{fmt(value)}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
    </div>
  )
}

function groupByFloor(slots: YardSlot[]): Array<{ tier: number; cells: YardSlot[] }> {
  const map = new Map<number, YardSlot[]>()
  for (const s of slots) {
    if (!map.has(s.tier)) map.set(s.tier, [])
    map.get(s.tier)!.push(s)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0]) // 1층 → 2층 → 3층 (오름차순)
    .map(([tier, list]) => ({ tier, cells: [...list].sort((x, y) => x.columnNo - y.columnNo) }))
}

function errMsg(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback
  const status = err.response?.status
  const data = err.response?.data as { message?: string; error?: string } | undefined
  // 서버가 message를 주면 그대로, 없으면 상태코드·error·URL로 원인을 최대한 드러낸다.
  const detail = data?.message ?? data?.error ?? err.message
  return status ? `[HTTP ${status}] ${detail ?? fallback}` : (detail ?? fallback)
}


/** [화주] 태그를 걷어낸 순수 특이사항 본문만 반환. */
function stripOwnerTag(memo?: string | null): string {
  if (!memo) return ''
  return memo.replace(/^\[[^\]]*\]\s*/, '').trim()
}

