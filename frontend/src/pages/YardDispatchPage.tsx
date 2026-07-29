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
  PackagePlus,
  Boxes,
  Grid3x3,
  Square,
} from 'lucide-react'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { yardApi, type YardSlot, type FloorPrice } from '@/api/yardApi'
import { containerApi, type Container } from '@/api/containerApi'
import { customerApi, type Customer } from '@/api/customerApi'
import { orderApi, type StorageOrder, type PaymentType, type PaymentMethod } from '@/api/orderApi'
import { staffApi, type Staff } from '@/api/staffApi'
import { addDays } from '@/lib/dates'
import { calcFloorFee } from '@/lib/fee'
import { useFloorPricing } from '@/hooks/useFloorPricing'
import { tenantApi } from '@/api/tenantApi'
import OutboundDatePresets from '@/components/ui/OutboundDatePresets'
import { orderSync } from '@/lib/orderEvents'
import StatCard from '@/components/ui/StatCard'
import Modal from '@/components/ui/Modal'
import Fab from '@/components/ui/Fab'
import MoneyInput from '@/components/ui/MoneyInput'
import CustomerListPicker from '@/components/customer/CustomerListPicker'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { calcDailyFee } from '@/lib/fee'
import { extractOwner } from '@/lib/owner'
import { nextContainerNo } from '@/lib/containerNo'
import { validateInOut, todayStr } from '@/lib/dateValidation'

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
  const [actionSlot, setActionSlot] = useState<YardSlot | null>(null)
  const [editSlot, setEditSlot] = useState<YardSlot | null>(null)
  const [dragging, setDragging] = useState<{ containerId: number; fromSlotId: number; label: string } | null>(null)
  const [gridOpen, setGridOpen] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const reload = () => setRefreshKey((k) => k + 1)

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

  const floors = useMemo(() => groupByFloor(slots), [slots])
  // 컨테이너에 연결된 계약(정산) 조회용 — 화주 카드에 보관기간·보관료를 매핑한다
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const kpi = useMemo(() => {
    const total = slots.length
    const occupied = slots.filter((s) => s.occupied).length
    return { total, occupied, empty: total - occupied }
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
  async function doQuickInbound(body: QuickInboundDto) {
    // 파이프라인: (계약 미연결 시) 새 계약 생성 → 컨테이너 생성 → 계약 배정 → 슬롯 적재
    // 화주는 memo 앞 태그로, 입고/출고예정일은 정식 필드로 저장.
    let orderId = body.orderId
    // 기존 계약을 연결하지 않았으면, 이 입고 정보로 새 계약을 만들어 계약 관리에도 뜨게 한다.
    // [선불 자동 정산] paymentType=PREPAID면 백엔드가 계약 등록과 한 트랜잭션으로 청구·수금까지 완결한다.
    if (orderId == null && body.customerId != null) {
      const order = await orderApi.create({
        customerId: body.customerId,
        warehouseId: body.warehouseId,
        storageStartDate: body.inboundDate ?? todayStr(),
        expectedEndDate: body.outboundDate,
        monthlyFee: body.monthlyFee ?? 0,
        capacityTons: body.capacityTons,
        paymentType: body.paymentType,
        memo: body.memo,
      })
      orderId = order.id
    }

    const tag = body.customerName ? `[${body.customerName}]` : ''
    const composedMemo = [tag, body.memo].filter(Boolean).join(' ').trim() || undefined
    // 컨테이너 번호는 업체 전체에서 유일해야 하므로 전 창고 기준으로 채번(충돌 방지)
    const allContainers = await containerApi.list({})
    const containerNo = nextContainerNo(new Set(allContainers.map((c) => c.containerNo)))
    const created = await containerApi.create({
      warehouseId: body.warehouseId,
      containerNo,
      capacityTon: body.capacityTon,   // 물리 컨테이너 용량 (보관 용량 입력값과 동기화, 기본 5톤)
      memo: composedMemo,
      inboundDate: body.inboundDate,
      expectedOutboundDate: body.outboundDate,
    })
    // 적재(OCCUPIED) 전에 배정해야 함(assignTo 는 AVAILABLE 상태만 허용)
    if (orderId != null) {
      await containerApi.assign(created.id, orderId)
    }
    await containerApi.inbound({ containerId: created.id, targetSlotId: body.targetSlotId })
  }

  async function handleOutbound(slot: YardSlot) {
    if (slot.containerId == null) return
    const owner = extractOwner(containersById.get(slot.containerId)?.memo) ?? '컨테이너'
    if (!window.confirm(`${owner} 컨테이너를 출고(슬롯 비움)할까요?`)) return
    try {
      await containerApi.outbound({ containerId: slot.containerId })
      setActionSlot(null)
      setBanner(`${owner} 출고 완료`)
      reload()
      orderSync.emit() // 계약관리·캘린더에 출고 전파

    } catch (err) {
      alert(errMsg(err, '출고에 실패했습니다.'))
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">컨테이너 관리</h2>
          <p className="mt-1 text-sm text-slate-500">격자를 클릭해 그 자리에서 입고·출고·이동을 즉시 처리합니다.</p>
        </div>
        {/* 데스크톱: 상단 버튼 / 모바일: 하단 FAB(엄지 존)이 대신한다 */}
        {isAdmin && selectedId != null && (
          <button
            type="button"
            onClick={() => setGridOpen(true)}
            className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 md:flex"
          >
            <Plus size={16} /> 자리 생성
          </button>
        )}
      </div>

      {isAdmin && selectedId != null && (
        <Fab actions={[{ label: '자리 생성', icon: Grid3x3, onClick: () => setGridOpen(true) }]} />
      )}

      {/* 창고 탭 + 검색 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {warehouses.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => {
                setSelectedId(w.id)
                setDragging(null)
              }}
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
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && slots.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
          <Grid3x3 size={26} className="text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-700">이 창고에 슬롯이 없습니다</p>
          <p className="mt-1 text-sm text-slate-400">
            {isAdmin ? '우측 상단 "자리 생성"으로 층별 자리를 만드세요.' : '관리자가 자리를 생성하면 표시됩니다.'}
          </p>
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <>
          {/* 모바일: 가로 3칸 요약 카드 (큰 숫자) */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            <YardStat label="총 컨테이너" value={kpi.total} tone="slate" />
            <YardStat label="사용중" value={kpi.occupied} tone="emerald" />
            <YardStat label="공실" value={kpi.empty} tone="indigo" />
          </div>
          {/* 데스크톱: 기존 StatCard */}
          <div className="hidden gap-4 md:grid md:grid-cols-3">
            <StatCard label="총 컨테이너" value={fmt(kpi.total)} icon={Grid3x3} tone="slate" />
            <StatCard label="사용중" value={fmt(kpi.occupied)} icon={Boxes} tone="indigo" />
            <StatCard label="공실" value={fmt(kpi.empty)} icon={Square} tone="emerald" />
          </div>

          <section className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-slate-200/60 sm:p-6">
            <div className="mb-4 flex items-center justify-end">
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
                      dragActive={dragging != null}
                      isDragSource={dragging?.fromSlotId === s.id}
                      onClick={() => (s.occupied ? setActionSlot(s) : setInboundSlot(s))}
                      onDragStartCell={() => {
                        if (s.occupied && s.containerId != null) {
                          setDragging({
                            containerId: s.containerId,
                            fromSlotId: s.id,
                            label: extractOwner(s.containerId != null ? containersById.get(s.containerId)?.memo : null) ?? s.containerNo ?? '컨테이너',
                          })
                        }
                      }}
                      onDropCell={() => handleDropMove(s)}
                      onDragEndCell={() => setDragging(null)}
                    />
                  ))}
                </div>
              )

              // ===== 모바일: 층별 섹션 (세로 연속 스크롤 · 카드에 화주/보관기간/보관료) =====
              if (isMobile) {
                return (
                  <div className="space-y-6">
                    {/* 이동 모드 안내 */}
                    {dragging && (
                      <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
                        <span className="min-w-0 truncate">「{dragging.label}」 이동 중 · 빈 자리를 누르세요</span>
                        <button type="button" onClick={() => setDragging(null)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-600">취소</button>
                      </div>
                    )}

                    {floors.map((floor) => {
                      const used = floor.cells.filter((cell) => cell.occupied).length
                      return (
                        <section key={floor.tier}>
                          {/* 층 타이틀 + 구분선 (크게·음영) */}
                          <div className="mb-3 flex items-center gap-3">
                            <div className="flex h-11 min-w-[3.5rem] items-center justify-center rounded-xl bg-slate-800 px-3 text-xl font-extrabold text-white shadow-md">
                              {floor.tier}층
                            </div>
                            <span className="text-sm font-semibold text-slate-500">{used}/{floor.cells.length} 사용중</span>
                            <div className="h-px flex-1 bg-slate-200" />
                          </div>

                          {/* 컨테이너 카드 — 화주명·보관기간·보관료 */}
                          <div className="space-y-2.5">
                            {floor.cells.map((s) => {
                              const c = s.containerId != null ? containersById.get(s.containerId) : undefined
                              const owner = extractOwner(c?.memo)
                              const matched = matchSlot(s)
                              if (s.occupied) {
                                const maint = c?.status === 'MAINTENANCE'
                                const order = c?.currentOrderId != null ? orderById.get(c.currentOrderId) : undefined
                                const start = order?.storageStartDate ?? c?.inboundDate
                                const end = order?.actualEndDate ?? order?.expectedEndDate ?? c?.expectedOutboundDate
                                const fee = order?.monthlyFee
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => setActionSlot(s)}
                                    className={cn(
                                      'w-full rounded-2xl border-2 border-l-[6px] bg-white p-4 text-left shadow-sm transition active:scale-[0.99]',
                                      maint ? 'border-amber-200 border-l-amber-500' : 'border-emerald-200 border-l-emerald-500',
                                      matched && 'ring-2 ring-amber-400',
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="truncate text-lg font-extrabold text-slate-800">{owner ?? '컨테이너'}</span>
                                      <span className="shrink-0 text-xs font-medium text-slate-400">{s.locationLabel}{maint ? ' · 점검' : ''}</span>
                                    </div>
                                    <div className="mt-2.5 space-y-1.5">
                                      <div className="flex items-center justify-between gap-2 text-sm">
                                        <span className="shrink-0 font-medium text-slate-400">보관기간</span>
                                        <span className="font-semibold text-slate-600">{fmtDate(start)} ~ {fmtDate(end)}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="shrink-0 text-sm font-medium text-slate-400">보관료</span>
                                        <span className="text-lg font-extrabold text-indigo-600">{fee != null ? `${fmt(fee)}원` : '—'}</span>
                                      </div>
                                    </div>
                                  </button>
                                )
                              }
                              // 빈 자리 (얇게) — 이동 모드면 이동 타겟, 아니면 입고
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={() => (dragging ? handleDropMove(s) : setInboundSlot(s))}
                                  className={cn(
                                    'flex w-full items-center justify-between gap-2 rounded-2xl border-2 border-dashed px-4 py-3 transition active:scale-[0.99]',
                                    dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50',
                                  )}
                                >
                                  <span className={cn('truncate text-sm font-bold', dragging ? 'text-indigo-700' : 'text-slate-400')}>
                                    {s.locationLabel} · {dragging ? '여기로 이동' : '빈 자리'}
                                  </span>
                                  <span className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-bold text-white">{dragging ? '선택' : '+ 입고'}</span>
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
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

      {/* 즉시 입고 팝업 */}
      {inboundSlot && selectedId != null && (
        <InboundModal
          slot={inboundSlot}
          warehouseId={selectedId}
          customers={customers}
          orders={orders}
          existingNos={new Set([...containersById.values()].map((c) => c.containerNo))}
          onClose={() => setInboundSlot(null)}
          onSubmit={doQuickInbound}
          onDone={() => {
            setInboundSlot(null)
            setBanner('입고 배치 완료')
            reload()
          }}
        />
      )}

      {/* 적재 슬롯 액션 패널 */}
      {actionSlot && (
        <ActionPanel
          slot={actionSlot}
          container={actionSlot.containerId != null ? containersById.get(actionSlot.containerId) : undefined}
          onClose={() => setActionSlot(null)}
          onOutbound={() => handleOutbound(actionSlot)}
          onMove={() => {
            const s = actionSlot
            if (s?.containerId != null) {
              setDragging({
                containerId: s.containerId,
                fromSlotId: s.id,
                label: extractOwner(containersById.get(s.containerId)?.memo) ?? s.containerNo ?? '컨테이너',
              })
            }
            setActionSlot(null)
          }}
          onEdit={() => {
            setEditSlot(actionSlot)
            setActionSlot(null)
          }}
        />
      )}

      {/* 보관 정보 수정 */}
      {editSlot && editSlot.containerId != null && (
        <EditModal
          slot={editSlot}
          container={containersById.get(editSlot.containerId)}
          onClose={() => setEditSlot(null)}
          onDone={() => {
            setEditSlot(null)
            setBanner('보관 정보 수정 완료')
            reload()
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
  onClick: () => void
  onDragStartCell: () => void
  onDropCell: () => void
  onDragEndCell: () => void
}) {
  const owner = extractOwner(container?.memo)
  const cellLabel = slot.occupied ? (owner ?? slot.containerNo ?? `${slot.tier}층`) : ''
  const dropTarget = dragActive && !slot.occupied
  const tooltip = slot.occupied
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
    : `${slot.locationLabel} · 빈 슬롯 (클릭해 입고)`

  return (
    <button
      type="button"
      draggable={slot.occupied}
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
        'flex h-9 w-16 items-center justify-center rounded-lg text-[11px] font-medium',
        'transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out',
        slot.occupied
          ? 'cursor-grab bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-[0_2px_8px_rgba(43,51,63,0.18)] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(43,51,63,0.22)] active:translate-y-0 active:cursor-grabbing'
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
    </button>
  )
}

/* ===== 즉시 입고 모달 ===== */
function InboundModal({
  slot,
  warehouseId,
  customers,
  orders,
  existingNos,
  onClose,
  onSubmit,
  onDone,
}: {
  slot: YardSlot
  warehouseId: number
  customers: Customer[]
  orders: StorageOrder[]
  existingNos: Set<string>
  onClose: () => void
  onSubmit: (body: QuickInboundDto) => Promise<void>
  onDone: () => void
}) {
  const [customerId, setCustomerId] = useState('')
  const [orderId, setOrderId] = useState('') // 선택 계약(빈 값이면 배정 안 함)
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [capacityTons, setCapacityTons] = useState<number | null>(null) // 보관 용량(톤)
  const [paymentType, setPaymentType] = useState<PaymentType>('PREPAID')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER')
  const [settlementUserId, setSettlementUserId] = useState<number | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const today = new Date().toISOString().slice(0, 10)
  const [inboundDate, setInboundDate] = useState(today)
  const [outboundDate, setOutboundDate] = useState(addDays(today, 9)) // 당일 포함 10일
  const [defaultDays, setDefaultDays] = useState(10) // 전역 기본 계약 유지 기간(당일 포함 보관일수)
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // 컨테이너 번호 자동 배정 (접두사 없이 순번) — 기존 번호 중 최대 정수 +1
  const autoNo = useMemo(() => nextContainerNo(existingNos), [existingNos])

  // [수납 계좌] 직원 목록 (계좌이체 담당 선택용) — 권한 없으면 빈 목록
  useEffect(() => {
    let alive = true
    staffApi.list().then((s) => alive && setStaffList(s)).catch(() => alive && setStaffList([]))
    return () => {
      alive = false
    }
  }, [])

  // 전역 기본 계약 유지 기간 로드 (출고 예정일 기본값)
  useEffect(() => {
    tenantApi.me().then((t) => setDefaultDays(t.defaultStoragePeriodDays ?? 10)).catch(() => {})
  }, [])

  // [자동 계산] 입고일이 변경되면 출고 예정일을 전역 기본 기간(당일 포함)만큼 뒤로 설정
  useEffect(() => {
    if (inboundDate && !outboundDate) {
      setOutboundDate(addDays(inboundDate, Math.max(defaultDays - 1, 0)))
    }
  }, [inboundDate])

  // [층 단가 연동] 이 슬롯의 층 단가·최소료로 보관료 자동 보정 (공통 엔진).
  //   새 계약 생성 시(기존 계약 미연결)만, 기간이 바뀌면 실시간 재계산 — 제로 타이핑.
  const floorPrices = useFloorPricing(warehouseId, true)
  useEffect(() => {
    if (orderId) return // 기존 계약에 연결하면 보관료는 그 계약을 따른다
    const rate = floorPrices.get(slot.tier)
    if (rate) setMonthlyFee(calcFloorFee(rate, inboundDate, outboundDate))
  }, [floorPrices, slot.tier, orderId, inboundDate, outboundDate])

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) ?? null,
    [customers, customerId],
  )

  // 선택된 화주 + 이 창고의 '입고(활성)' 계약만 연결 대상으로 노출.
  //   [상태 모델] 계약 상태는 INBOUND/OUTBOUND 이진 — 예전 RECEIVED/IN_STORAGE 값은 폐기됨.
  //   컨테이너 미지정으로 등록된 활성 계약을 이 입고 컨테이너에 연결할 수 있게 한다.
  const contractOptions = useMemo(() => {
    if (!selectedCustomer) return []
    return orders.filter(
      (o) =>
        o.customerId === selectedCustomer.id &&
        o.warehouseId === warehouseId &&
        o.status === 'INBOUND',
    )
  }, [orders, selectedCustomer, warehouseId])

  // 화주를 바꾸면 이전 계약 선택은 초기화
  useEffect(() => {
    setOrderId('')
  }, [customerId])

  // [실시간] 하루 보관료 = 보관료 ÷ (입고일~출고예정일 일수, 당일 포함).
  // 보관료·입고일·출고예정일이 모두 유효할 때만 값, 아니면 null(빈 값).
  const dailyFee = useMemo(
    () => calcDailyFee(monthlyFee, inboundDate, outboundDate),
    [monthlyFee, inboundDate, outboundDate],
  )

  // 실제 입고 확정이므로 입고일 미래 불가 + 출고예정일 >= 입고일
  const dateError = validateInOut(inboundDate, outboundDate)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId) return setFormError('화주(고객)를 선택하세요.')
    if (dateError) return setFormError(dateError)
    // 기존 계약을 연결하지 않으면 이 입고로 새 계약이 생성되므로 보관료가 필요하다.
    if (!orderId && (monthlyFee == null || monthlyFee <= 0)) {
      return setFormError('보관료를 입력하세요. (입고 시 새 계약이 생성됩니다)')
    }
    setFormError(null)
    setSubmitting(true)
    try {
      await onSubmit({
        warehouseId,
        targetSlotId: slot.id,
        containerNo: autoNo,
        capacityTon: capacityTons ?? 5, // 보관 용량 입력값(없으면 기본 5톤)을 컨테이너 용량으로도 반영
        capacityTons: !orderId ? (capacityTons ?? undefined) : undefined, // 새 계약 생성 시에만 보관 용량 전달
        customerId: Number(customerId),
        customerName: selectedCustomer?.name,
        orderId: orderId ? Number(orderId) : undefined,
        monthlyFee: monthlyFee ?? undefined,
        paymentType: !orderId ? paymentType : undefined,
        paymentMethod: !orderId ? paymentMethod : undefined,
        settlementUserId: !orderId && paymentMethod === 'BANK_TRANSFER' ? (settlementUserId ?? undefined) : undefined,
        inboundDate: inboundDate || undefined,
        outboundDate: outboundDate || undefined,
        memo: memo.trim() || undefined,
      })
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '입고에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="즉시 입고 및 배치" widthClass="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
          <PackagePlus size={16} />
          위치 <span className="font-semibold">{slot.locationLabel}</span> 에 새 컨테이너를 배치합니다.
        </div>

        {/* 좌: 입고 정보 폼 / 우: 화주 선택 리스트 */}
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_19rem]">
          {/* ===== 좌측 폼 ===== */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">화주(고객) *</label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{selectedCustomer.name}</p>
                    <p className="truncate text-xs text-slate-500">{selectedCustomer.phoneNumber || '연락처 없음'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomerId('')}
                    className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
                    title="선택 해제"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400">
                  오른쪽 목록에서 화주를 선택하세요.
                </p>
              )}
            </div>

            {/* 계약 연결(선택) — 화주 선택 시 이 창고의 활성 계약을 골라 정식 배정 */}
            {selectedCustomer && (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">계약 연결 (선택)</label>
                {contractOptions.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400">
                    이 창고에 연결할 활성 계약이 없습니다. (배정 없이 입고됩니다)
                  </p>
                ) : (
                  <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className={inputCls}>
                    <option value="">배정 안 함</option>
                    {contractOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.storageStartDate}~{o.expectedEndDate ?? '미정'} · {fmt(o.monthlyFee)}원/월
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">보관료</label>
                <MoneyInput
                  value={monthlyFee}
                  onChange={setMonthlyFee}
                  placeholder="예: 300,000"
                  className={cn(inputCls, 'pr-9')}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">하루 보관료</label>
                {/* 보관료·입고일·출고예정일이 모두 유효할 때만 실시간 표시(읽기 전용). 아니면 빈 값 */}
                <div className="flex h-[38px] items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-indigo-600">
                  {dailyFee != null ? `${fmt(dailyFee)}원` : ''}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">보관료 ÷ 보관일수 (당일 포함)</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">보관 용량 (톤)</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    step="0.1"
                    value={capacityTons ?? ''}
                    onChange={(e) => setCapacityTons(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="예: 5"
                    className={cn(inputCls, 'pr-10')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">톤</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">입고일</label>
                <input type="date" value={inboundDate} max={todayStr()} onChange={(e) => setInboundDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">출고 예정일</label>
                <input type="date" value={outboundDate} min={inboundDate || undefined} onChange={(e) => setOutboundDate(e.target.value)} className={inputCls} />
                <OutboundDatePresets startDate={inboundDate} onPick={setOutboundDate} className="mt-1.5" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">결제 방식 (신규 계약 시)</label>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={inputCls}>
                  <option value="PREPAID">선불 (당일 완납)</option>
                  <option value="POSTPAID">후불</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">결제 수단</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                  <option value="BANK_TRANSFER">계좌이체</option>
                  <option value="CASH">현금</option>
                  <option value="CARD">카드</option>
                </select>
              </div>
            </div>

            {/* [계좌 연동] 계좌이체일 때만 입금 계좌(담당 직원) 지정 */}
            {!orderId && paymentMethod === 'BANK_TRANSFER' && (
              <InboundAccountPicker staffList={staffList} value={settlementUserId} onChange={setSettlementUserId} />
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">특이사항</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder="컨테이너 특이사항을 자유롭게 입력하세요."
                className={cn(inputCls, 'min-h-55 resize-y')}
              />
            </div>
          </div>

          {/* ===== 우측 화주 선택 리스트 (공용 컴포넌트) ===== */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">화주 검색</label>
            <CustomerListPicker
              customers={customers}
              selectedId={customerId ? Number(customerId) : null}
              onSelect={(c) => setCustomerId(String(c.id))}
              heightClass="max-h-[30rem]"
            />
          </div>
        </div>

        {dateError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{dateError}</p>
        )}
        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting || dateError != null} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting && <Loader2 size={14} className="animate-spin" />}
            입고 배치
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== 적재 슬롯 액션 패널 ===== */
function ActionPanel({
  slot,
  container,
  onClose,
  onOutbound,
  onMove,
  onEdit,
}: {
  slot: YardSlot
  container?: Container
  onClose: () => void
  onOutbound: () => void
  onMove: () => void
  onEdit: () => void
}) {
  const isMobile = useIsMobile()
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-800">{extractOwner(container?.memo) ?? '컨테이너'}</h3>
            <p className="text-xs text-slate-500">{slot.locationLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-6 py-5">
          <dl className="grid grid-cols-2 gap-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-slate-400">화주(고객)</dt>
              <dd className="font-semibold text-slate-800">{extractOwner(container?.memo) ?? '—'}</dd>
            </div>
            <Info label="용량">{container ? `${container.capacityTon}톤` : '—'}</Info>
            <Info label="상태">{container ? (CONTAINER_STATUS_KO[container.status] ?? container.status) : '—'}</Info>
            <Info label="입고일">{container?.inboundDate ?? '—'}</Info>
            <Info label="출고 예정일">{container?.expectedOutboundDate ?? '—'}</Info>
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3.5 text-base font-bold text-white transition hover:bg-amber-600 active:scale-[0.99]"
          >
            <LogOut size={18} /> 즉시 출고 처리
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
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-3.5 text-base font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.99]"
          >
            <Pencil size={18} /> 보관 정보 수정
          </button>
        </div>
      </div>
    </div>
  )
}

/* ===== 보관 정보 수정 ===== */
function EditModal({
  slot,
  container,
  onClose,
  onDone,
}: {
  slot: YardSlot
  container?: Container
  onClose: () => void
  onDone: () => void
}) {
  const [capacityTon, setCapacityTon] = useState(container?.capacityTon ?? 5)
  // 특이사항 편집은 [화주] 태그를 뺀 본문만 다룬다(저장 시 태그를 다시 붙임)
  const [memo, setMemo] = useState(stripOwnerTag(container?.memo))
  const [inboundDate, setInboundDate] = useState(container?.inboundDate ?? '')
  const [expectedOutboundDate, setExpectedOutboundDate] = useState(container?.expectedOutboundDate ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const dateError = validateInOut(inboundDate, expectedOutboundDate)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (slot.containerId == null) return
    if (dateError) return setFormError(dateError)
    setFormError(null)
    setSubmitting(true)
    try {
      // [화주 보존] 편집한 특이사항 본문 앞에 기존 [화주] 태그를 다시 붙여 저장
      const composedMemo = [ownerTag(container?.memo), memo.trim()].filter(Boolean).join(' ').trim() || undefined
      // 컨테이너 번호는 변경하지 않지만 백엔드 필수값이라 기존 번호를 그대로 실어 보낸다.
      await containerApi.update(slot.containerId, {
        containerNo: slot.containerNo ?? container?.containerNo ?? undefined,
        capacityTon,
        memo: composedMemo,
        inboundDate: inboundDate || undefined,
        expectedOutboundDate: expectedOutboundDate || undefined,
      })
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '수정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`${extractOwner(container?.memo) ?? '컨테이너'} · 보관 정보 수정`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span className="block text-xs text-slate-400">화주(고객)</span>
          <span className="font-semibold text-slate-800">{extractOwner(container?.memo) ?? '—'}</span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">용량(톤)</label>
          <input type="number" min={1} value={capacityTon} onChange={(e) => setCapacityTon(Number(e.target.value))} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">입고일</label>
            <input type="date" value={inboundDate} max={todayStr()} onChange={(e) => setInboundDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">출고 예정일</label>
            <input type="date" value={expectedOutboundDate} min={inboundDate || undefined} onChange={(e) => setExpectedOutboundDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        {dateError && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{dateError}</p>}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">특이사항</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputCls} />
        </div>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting || dateError != null} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
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
function InboundAccountPicker({
  staffList,
  value,
  onChange,
}: {
  staffList: Staff[]
  value: number | null
  onChange: (id: number | null) => void
}) {
  const withAccount = staffList.filter((s) => s.accountNumber)
  const selected = withAccount.find((s) => s.id === value) ?? null
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <label className="mb-1 block text-sm font-medium text-slate-700">입금 계좌 (담당 직원)</label>
      {withAccount.length === 0 ? (
        <p className="text-xs text-slate-400">계좌가 등록된 직원이 없습니다. 직원 관리에서 계좌를 먼저 등록하세요.</p>
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

// 층(tier)별로 묶어 높은 층이 위로, 각 층은 자리 번호(columnNo) 오름차순
/* 모바일 가로 요약 카드 — 큰 숫자 + 작은 라벨 */
function YardStat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'indigo' }) {
  const numCls =
    tone === 'emerald' ? 'text-emerald-600' : tone === 'indigo' ? 'text-indigo-600' : 'text-slate-800'
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-soft ring-1 ring-slate-200/60">
      <p className={cn('text-3xl font-extrabold leading-none', numCls)}>{fmt(value)}</p>
      <p className="mt-1.5 text-xs font-semibold text-slate-500">{label}</p>
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

/** memo 앞머리의 [ ... ] 화주 태그 원문(대괄호 포함). 없으면 빈 문자열. */
function ownerTag(memo?: string | null): string {
  if (!memo) return ''
  const m = memo.match(/^\[[^\]]*\]/)
  return m ? m[0] : ''
}

/** [화주] 태그를 걷어낸 순수 특이사항 본문만 반환. */
function stripOwnerTag(memo?: string | null): string {
  if (!memo) return ''
  return memo.replace(/^\[[^\]]*\]\s*/, '').trim()
}

