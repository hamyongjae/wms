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
import { yardApi, type YardSlot } from '@/api/yardApi'
import { containerApi, type Container } from '@/api/containerApi'
import { customerApi, type Customer } from '@/api/customerApi'
import StatCard from '@/components/ui/StatCard'
import Modal from '@/components/ui/Modal'
import MoneyInput from '@/components/ui/MoneyInput'
import CustomerListPicker from '@/components/customer/CustomerListPicker'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { calcDailyFee } from '@/lib/fee'
import { extractOwner } from '@/lib/owner'
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
  customerName?: string
  inboundDate?: string
  outboundDate?: string
  memo?: string
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

const fmt = (n: number) => n.toLocaleString('ko-KR')

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

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
    ])
      .then(([sl, cs, cu]) => {
        setSlots(sl)
        setContainersById(new Map(cs.map((c) => [c.id, c])))
        setCustomers(cu)
      })
      .catch(() => setError('보관창고 현황을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [selectedId, refreshKey])

  const blocks = useMemo(() => groupByBlock(slots), [slots])
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
    // 파이프라인: 컨테이너 생성 → 해당 슬롯에 입고 배치
    // 화주는 memo 앞 태그로, 입고/출고예정일은 정식 필드로 저장.
    const tag = body.customerName ? `[${body.customerName}]` : ''
    const composedMemo = [tag, body.memo].filter(Boolean).join(' ').trim() || undefined
    const created = await containerApi.create({
      warehouseId: body.warehouseId,
      containerNo: body.containerNo,
      capacityTon: body.capacityTon,
      memo: composedMemo,
      inboundDate: body.inboundDate,
      expectedOutboundDate: body.outboundDate,
    })
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
        {isAdmin && selectedId != null && (
          <button
            type="button"
            onClick={() => setGridOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Plus size={16} /> 구역 생성
          </button>
        )}
      </div>

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
            {isAdmin ? '우측 상단 "구역 생성"으로 격자를 만드세요.' : '관리자가 격자를 생성하면 표시됩니다.'}
          </p>
        </div>
      )}

      {!loading && !error && slots.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="총 컨테이너" value={fmt(kpi.total)} icon={Grid3x3} tone="slate" />
            <StatCard label="사용중" value={fmt(kpi.occupied)} icon={Boxes} tone="indigo" />
            <StatCard label="공실" value={fmt(kpi.empty)} icon={Square} tone="emerald" />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-end">
              <Legend />
            </div>

            <div className="space-y-6">
              {blocks.map(({ block, bays }) => (
                <div key={block}>
                  <p className="mb-2 text-sm font-medium text-slate-700">{block} 구역</p>
                  <div className="flex flex-wrap gap-3">
                    {bays.map((bay) => (
                      <div key={bay.key} className="flex flex-col gap-1">
                          {bay.tiers.map((s) => (
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
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* 즉시 입고 팝업 */}
      {inboundSlot && selectedId != null && (
        <InboundModal
          slot={inboundSlot}
          warehouseId={selectedId}
          customers={customers}
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
        'flex h-9 w-16 items-center justify-center rounded-md text-[11px] font-medium transition',
        slot.occupied
          ? 'cursor-grab bg-indigo-500 text-white shadow-sm hover:bg-indigo-600 active:cursor-grabbing'
          : dropTarget
            ? 'border-2 border-dashed border-emerald-400 bg-emerald-50 text-emerald-500'
            : 'border border-dashed border-slate-300 text-slate-300 hover:border-indigo-400 hover:text-indigo-500',
        isDragSource && 'opacity-40',
        highlighted && 'animate-pulse ring-2 ring-amber-400 ring-offset-1',
      )}
    >
      {slot.occupied ? <span className="truncate px-1">{cellLabel}</span> : <Plus size={14} />}
    </button>
  )
}

/* ===== 즉시 입고 모달 ===== */
function InboundModal({
  slot,
  warehouseId,
  customers,
  existingNos,
  onClose,
  onSubmit,
  onDone,
}: {
  slot: YardSlot
  warehouseId: number
  customers: Customer[]
  existingNos: Set<string>
  onClose: () => void
  onSubmit: (body: QuickInboundDto) => Promise<void>
  onDone: () => void
}) {
  const [customerId, setCustomerId] = useState('')
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [inboundDate, setInboundDate] = useState(new Date().toISOString().slice(0, 10))
  const [outboundDate, setOutboundDate] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // 컨테이너 번호 자동 배정 (접두사 없이 순번) — 기존 번호 중 최대 정수 +1
  const autoNo = useMemo(() => nextContainerNo(existingNos), [existingNos])

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(c.id) === customerId) ?? null,
    [customers, customerId],
  )

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
    setFormError(null)
    setSubmitting(true)
    try {
      // 컨테이너 전용 금액 필드가 없어, 입력한 보관료는 특이사항 메모에 함께 기록한다.
      const feeNote = monthlyFee != null && monthlyFee > 0 ? `보관료 ${fmt(monthlyFee)}원` : ''
      const noteBody = [feeNote, memo.trim()].filter(Boolean).join(' · ') || undefined
      await onSubmit({
        warehouseId,
        targetSlotId: slot.id,
        containerNo: autoNo,
        capacityTon: 5, // 기본 5톤 임대 단위(용량 입력칸 제거)
        customerName: customers.find((c) => String(c.id) === customerId)?.name,
        inboundDate: inboundDate || undefined,
        outboundDate: outboundDate || undefined,
        memo: noteBody,
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">입고일</label>
                <input type="date" value={inboundDate} max={todayStr()} onChange={(e) => setInboundDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">출고 예정일</label>
                <input type="date" value={outboundDate} min={inboundDate || undefined} onChange={(e) => setOutboundDate(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">특이사항</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={3}
                placeholder="컨테이너 특이사항을 자유롭게 입력하세요."
                className={cn(inputCls, 'min-h-20 resize-y')}
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
  onEdit: () => void
}) {
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

          <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <ArrowRightLeft size={13} /> 이동은 맵에서 컨테이너를 빈 슬롯으로 <b>드래그</b>하세요.
          </p>

          <button
            type="button"
            onClick={onOutbound}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            <LogOut size={16} /> 즉시 출고 처리
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <Pencil size={16} /> 보관 정보 수정
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

/* ===== 구역 생성 ===== */
function GridModal({
  warehouseId,
  onClose,
  onDone,
}: {
  warehouseId: number
  onClose: () => void
  onDone: () => void
}) {
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
      await yardApi.generateGrid({ warehouseId, block, rows: Number(rows), columns: Number(columns), tiers: Number(tiers) })
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '생성에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="보관창고 구역(격자) 생성">
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
          총 <span className="font-semibold text-slate-700">{total}</span>칸 생성 (이미 있는 좌표는 건너뜀)
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
        <span className="h-3 w-3 rounded bg-indigo-500" /> 적재중
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded border border-dashed border-slate-300" /> 공실
      </span>
    </div>
  )
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

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
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

/** 접두사 없이 순번 컨테이너 번호 자동 생성 — 기존 숫자 번호 중 최대값 +1 (없으면 1001). */
function nextContainerNo(existing: Set<string>): string {
  let max = 1000
  for (const no of existing) {
    if (/^\d+$/.test(no)) {
      const n = parseInt(no, 10)
      if (n > max) max = n
    }
  }
  return String(max + 1)
}
