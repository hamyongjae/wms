import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { Plus, Loader2, FileText, ShieldAlert, AlertTriangle, X, Search, ChevronDown } from 'lucide-react'
import { orderApi, type StorageOrder, type OrderStatus, type PaymentType, type PaymentMethod as OrderPaymentMethod } from '@/api/orderApi'
import { staffApi, type Staff } from '@/api/staffApi'
import { billingApi, type BillingLedger } from '@/api/billingApi'
import { isOpenLedger } from '@/lib/billing'
import LedgerRow from '@/components/billing/LedgerRow'
import { customerApi, type Customer, type CustomerType } from '@/api/customerApi'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { containerApi } from '@/api/containerApi'
import { yardApi } from '@/api/yardApi'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { validateContractPeriod } from '@/lib/dateValidation'
import { calcDailyFee, calcMonthlyFeeFromDaily, storageDays } from '@/lib/fee'
import { extractOwner } from '@/lib/owner'
import { orderSync } from '@/lib/orderEvents'
import { today, addDays, addMonths, getDurationDays, md } from '@/lib/dates'
import Modal from '@/components/ui/Modal'
import Fab from '@/components/ui/Fab'
import MoneyInput from '@/components/ui/MoneyInput'
import DateRangeLabel from '@/components/ui/DateRangeLabel'
import CustomerListPicker from '@/components/customer/CustomerListPicker'
import LocationPickerField from '@/components/yard/LocationPickerField'
import EditOrderModal from '@/components/order/EditOrderModal'
import PaymentAccountPicker from '@/components/order/PaymentAccountPicker'
import { placeContainerAtSlot } from '@/lib/containerPlacement'
import {
  AutoBillingToggle,
  CalendarField,
  Field,
  FieldGrid,
  FormActions,
  GridField,
  gridInputCls,
  gridReadonlyCls,
  inputCls,
  labelCls,
  UndecidedPlaceholder,
  UndecidedToggle,
} from '@/components/order/orderFormUi'


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
// 조회 기간 검색창 표기용 — "2026년 01월 01일"
const ymdKorean = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${y}년 ${m}월 ${d}일`
}

/* 모바일 카드: 라벨-값 한 줄 */
function InfoRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-sm font-medium text-slate-400">{label}</span>
      <span className={cn('truncate text-right', strong ? 'text-lg font-bold text-slate-800' : 'text-base text-slate-600')}>
        {value}
      </span>
    </div>
  )
}

/* 모바일 카드: 액션 버튼 — 주 액션(출고 처리 등)까지 같은 격자·같은 크기로 통일한다 */
function MobileBtn({
  label,
  onClick,
  tone = 'default',
}: {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger' | 'amber' | 'indigo'
}) {
  const cls = {
    default: 'bg-slate-100 text-slate-700 active:bg-slate-200',
    danger: 'bg-red-50 text-red-600 active:bg-red-100',
    amber: 'bg-amber-500 text-white active:bg-amber-600',
    indigo: 'bg-indigo-600 text-white active:bg-indigo-700',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('rounded-xl py-2 text-sm font-bold transition active:scale-[0.98]', cls)}
    >
      {label}
    </button>
  )
}

export default function OrdersPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  // [대시보드 원터치 진입] 오늘의 입고/출고 카드에서 ?today=inbound|outbound 로 들어오면
  // 상태 필터 칩과 조회 기간을 "오늘 하루"로 자동 입력해 그대로 조회한다 — 평소 조회와 같은
  // 화면·같은 동선이라 별도 안내 문구 없이도 뭘 보고 있는지 필터 칩·날짜창에서 바로 보인다.
  const [searchParams, setSearchParams] = useSearchParams()

  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [filter, setFilter] = useState<FilterKey>(() => {
    const t = searchParams.get('today')
    return t === 'inbound' ? 'INBOUND' : t === 'outbound' ? 'OUTBOUND' : 'ALL'
  })
  const [query, setQuery] = useState('') // 조회어(고객명·창고명)
  // [단일 날짜 조회] 비워두면 전체 계약, 날짜를 고르면 그 날짜에 입고 또는 출고 일정이 있는 계약만
  const [date, setDate] = useState<string>(() => searchParams.get('today') ? today() : '')

  // 진입 시 한 번 적용한 뒤 쿼리스트링은 정리 — 이후는 화면의 필터 칩·날짜창이 상태의 유일한 출처
  useEffect(() => {
    if (searchParams.get('today')) setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<StorageOrder | null>(null)
  const [billingTarget, setBillingTarget] = useState<StorageOrder | null>(null) // 정산 타임라인
  const [statusTarget, setStatusTarget] = useState<StorageOrder | null>(null) // 입/출고 처리 모달 대상
  // 계약 id → 배치된 슬롯 위치 라벨 목록 (창고+화주 기준으로 조인)
  const [locationsByOrder, setLocationsByOrder] = useState<Map<number, string[]>>(new Map())
  // [주의 필요 필터] 상단 경고 배너를 눌러 "입고 미배치" / "출고 지연" 건만 골라 보기.
  //   상태 탭(전체/입고/출고)과는 별개 축이라, 활성화하면 다른 조회 조건은 초기화해 결과가 헷갈리지 않게 한다.
  const [attention, setAttention] = useState<'NONE' | 'UNPLACED' | 'OVERDUE'>('NONE')

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
        // [정산 이력 팝업 새로고침] 열어둔 채로 "다음 회차 생성"을 연달아 누르면 서버가 계약의
        //   예정 출고일을 자동 연장해도(extendOrderPeriod) 팝업은 처음 열 때의 계약 스냅샷을 그대로
        //   들고 있어 "계약 기간"·초과 경고가 옛 날짜에 머물렀다 — 목록 갱신 때마다 최신 값으로 맞춘다.
        setBillingTarget((prev) => (prev ? (o.find((x) => x.id === prev.id) ?? prev) : prev))
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

  // [주의 필요 판정]
  //  - 입고 미배치: 보관 시작일이 지났는데(당일은 아직 입고 작업 중일 수 있으니 다음 날부터)
  //    아직 어느 슬롯에도 배치되지 않은 경우 — 현장에서 실제 컨테이너 번호 등록을 빠뜨렸을 가능성이 높다.
  //  - 출고 지연: 출고 예정일이 지났는데 아직 출고 처리가 안 돼 컨테이너를 그대로 점유 중인 경우.
  const isUnplaced = (o: StorageOrder) =>
    o.status === 'INBOUND' && o.storageStartDate < today() && (locationsByOrder.get(o.id)?.length ?? 0) === 0
  const isOutboundOverdue = (o: StorageOrder) =>
    o.status === 'INBOUND' && o.expectedEndDate != null && o.expectedEndDate < today()

  const unplacedCount = useMemo(
    () => orders.filter(isUnplaced).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, locationsByOrder],
  )
  const overdueCount = useMemo(() => orders.filter(isOutboundOverdue).length, [orders])

  // [주의 필터 자동 해제] 배너를 켠 뒤 그 문제(미배치/지연)가 다른 화면에서 해결되면 배너 자체는
  //   카운트가 0이 되어 사라지지만(그 안에 있던 "필터 해제" 버튼도 함께 사라진다), attention 상태는
  //   그대로 남아 목록만 계속 걸러진 채였다 — 상단 칩(전체/입고/출고)은 attention과 무관하게 세므로
  //   숫자는 정상인데 목록만 텅 비어 보이는 버그로 실제 보고됨. 카운트가 0이 되는 순간 자동으로 끈다.
  useEffect(() => {
    if (attention === 'UNPLACED' && unplacedCount === 0) setAttention('NONE')
    if (attention === 'OVERDUE' && overdueCount === 0) setAttention('NONE')
  }, [attention, unplacedCount, overdueCount])

  // 배너를 눌러 주의 필요 목록만 볼 때는 다른 조회 조건(상태 탭·조회어·날짜)을 비워
  // "지금 이 화면에 보이는 게 전부"라는 걸 명확히 한다.
  function toggleAttention(kind: 'UNPLACED' | 'OVERDUE') {
    setAttention((prev) => (prev === kind ? 'NONE' : kind))
    setFilter('ALL')
    setQuery('')
    setDate('')
  }

  // [필터 칩 개수 = 실제 조회 결과와 항상 일치] 조회어·날짜 조건은 그대로 두고 상태(전체/입고/출고)만 바꿔가며
  //   세어야, 칩에 적힌 숫자와 칩을 눌렀을 때 실제로 보이는 건수가 어긋나지 않는다.
  //
  // [필터 칩의 의미가 날짜 유무에 따라 바뀐다]
  //   날짜 미지정: 칩 = 계약의 "현재 상태"(입고중/출고완료).
  //   날짜 지정: 칩 = 그 날짜의 "이벤트 종류"(입고 예정/출고 예정·완료) — 아직 출고 처리 전이라
  //     status가 INBOUND 그대로인 '출고 예정' 계약도 출고 칩에서 보여야 하므로, 현재 상태로 걸러버리면
  //     "그 날 출고할 계약인데 아직 처리 전"인 건이 출고 칩에서 사라져 버린다(실제 리포트된 버그).
  function matchesFilter(o: StorageOrder, key: FilterKey): boolean {
    const q = query.trim().toLowerCase()
    if (q && !`${o.customerName} ${o.warehouseName}`.toLowerCase().includes(q)) return false

    if (date) {
      const isInboundThatDay = o.storageStartDate === date
      const isOutboundThatDay = o.actualEndDate === date || o.expectedEndDate === date
      if (key === 'INBOUND') return isInboundThatDay
      if (key === 'OUTBOUND') return isOutboundThatDay
      return isInboundThatDay || isOutboundThatDay // ALL
    }

    if (key !== 'ALL' && o.status !== key) return false
    return true
  }

  const visible = useMemo(() => {
    const base = orders.filter((o) => matchesFilter(o, filter))
    if (attention === 'UNPLACED') return base.filter(isUnplaced)
    if (attention === 'OVERDUE') return base.filter(isOutboundOverdue)
    return base
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, filter, query, date, attention, locationsByOrder])

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
    if (!window.confirm(`'${o.customerName}' 계약을 삭제할까요?\n(연결된 정산서·입금 내역도 함께 삭제됩니다)`)) return
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
    <div className="flex flex-nowrap items-center justify-end gap-2">
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
    <div className="mx-auto max-w-6xl space-y-3 md:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">계약 관리</h2>
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

      {/* [주의 필요 배너] 입고일 지났는데 위치 미배치 / 출고일 지났는데 그대로 점유 중인 계약을
          숫자로 먼저 보여주고, 눌러서 바로 그 목록만 걸러본다. 0건이면 배너 자체를 숨겨 평소엔 조용하다. */}
      {(unplacedCount > 0 || overdueCount > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {unplacedCount > 0 && (
            <button
              type="button"
              onClick={() => toggleAttention('UNPLACED')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition',
                attention === 'UNPLACED'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100',
              )}
            >
              <AlertTriangle size={14} />
              입고 미배치 {unplacedCount}건
            </button>
          )}
          {overdueCount > 0 && (
            <button
              type="button"
              onClick={() => toggleAttention('OVERDUE')}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition',
                attention === 'OVERDUE'
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100',
              )}
            >
              <AlertTriangle size={14} />
              출고 지연 {overdueCount}건
            </button>
          )}
          {attention !== 'NONE' && (
            <button
              type="button"
              onClick={() => setAttention('NONE')}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition hover:text-slate-600"
            >
              <X size={14} />
              필터 해제
            </button>
          )}
        </div>
      )}

      {/* 조회 기간 — 상태 필터(전체·입고·출고) + 사용자 지정 기간(기본: 오늘로부터 한 달) */}
      <div className="rounded-2xl bg-white p-2.5 shadow-soft ring-1 ring-slate-200/60">
        {/* 데스크톱: 작은 필터 칩 */}
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {FILTERS.map((f) => {
            const count = orders.filter((o) => matchesFilter(o, f.key)).length
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

        {/* 모바일: 상태 퀵탭 — 한 번 터치로 원하는 상태만 보기 */}
        <div className="grid grid-cols-3 gap-1.5 md:hidden">
          {FILTERS.map((f) => {
            const count = orders.filter((o) => matchesFilter(o, f.key)).length
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  'flex flex-col items-center rounded-xl py-2 text-sm font-bold transition active:scale-[0.98]',
                  active ? 'bg-slate-800 text-white shadow-sm' : 'bg-white text-slate-500 ring-1 ring-slate-200',
                )}
              >
                {f.label}
                <span className={cn('mt-0.5 text-xs font-semibold', active ? 'text-white/80' : 'text-slate-400')}>{count}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {/* [단일 날짜 조회] 비워두면 전체 계약, 날짜를 고르면 그 날짜의 입고·출고 일정만 */}
          <CalendarField
            value={date}
            onChange={setDate}
            format={ymdKorean}
            placeholder="날짜로 조회 (미입력 시 전체)"
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {date && (
            <button
              type="button"
              onClick={() => setDate('')}
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50"
            >
              전체 보기
            </button>
          )}
        </div>
      </div>

      {/* 조회 — 고객명 또는 창고 이름 (상태 탭과 함께 동작) */}
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="고객명 또는 창고 이름으로 조회"
          className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-11 pr-11 text-base outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 md:py-2 md:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="조회어 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition active:text-slate-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <FileText size={22} />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-700">
            {query.trim() || filter !== 'ALL' || date || attention !== 'NONE' ? '조회 결과가 없습니다' : '계약이 없습니다'}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {query.trim() || filter !== 'ALL' || date || attention !== 'NONE'
              ? '다른 날짜·조건으로 다시 조회해 보세요.'
              : '"계약 등록"으로 첫 보관 계약을 추가하세요.'}
          </p>
        </div>
      )}

      {/* ===== 데스크톱: 테이블 (md 이상) ===== */}
      {!loading && !error && visible.length > 0 && (
        <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60 md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="whitespace-nowrap px-5 py-3 font-medium">고객</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">창고</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">위치</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">보관기간</th>
                <th className="whitespace-nowrap px-5 py-3 text-right font-medium">보관료</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">상태</th>
                <th className="whitespace-nowrap px-5 py-3 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((o) => (
                <tr key={o.id} className="transition hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-800">{o.customerName}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">{o.warehouseName}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                    <OrderLocationBadge locs={locationsByOrder.get(o.id) ?? []} overdue={isUnplaced(o)} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                    <DateRangeLabel start={o.storageStartDate} end={o.actualEndDate ?? o.expectedEndDate} size="sm" />
                    {isOutboundOverdue(o) && (
                      <div className="mt-0.5">
                        <OutboundOverdueBadge />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-slate-700">{won(o.monthlyFee)}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{renderActions(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== 모바일: 큰 요약 카드 + 원터치 액션 (md 미만) ===== */}
      {!loading && !error && visible.length > 0 && (
        <div className="space-y-1.5 md:hidden">
          {visible.map((o) => {
            const locs = locationsByOrder.get(o.id) ?? []
            return (
              <div key={o.id} className="rounded-2xl bg-white p-2.5 shadow-soft ring-1 ring-slate-200/60">
                {/* 헤더: 고객 + 상태 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-slate-800">{o.customerName}</p>
                    <p className="truncate text-xs text-slate-500">{o.warehouseName}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <OrderStatusBadge status={o.status} />
                    {isOutboundOverdue(o) && <OutboundOverdueBadge />}
                  </div>
                </div>

                {/* 핵심 정보 */}
                <div className="mt-1.5 space-y-1">
                  <InfoRow label="보관료" value={won(o.monthlyFee)} strong />
                  <InfoRow
                    label="보관기간"
                    value={<DateRangeLabel start={o.storageStartDate} end={o.actualEndDate ?? o.expectedEndDate} format={md} />}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="shrink-0 text-sm font-medium text-slate-400">위치</span>
                    <OrderLocationBadge locs={locs} overdue={isUnplaced(o)} />
                  </div>
                </div>

                {/* 액션 — 주 액션(출고 처리/출고취소)이 항상 첫 자리·같은 색(amber)이고
                    정산이 항상 둘째 자리·같은 색(default)이도록 데스크톱 RowAction과 통일 */}
                <div className={cn('mt-1.5 grid gap-1.5', isAdmin ? 'grid-cols-4' : 'grid-cols-3')}>
                  {o.status === 'INBOUND' ? (
                    <MobileBtn label="출고 처리" tone="amber" onClick={() => setStatusTarget(o)} />
                  ) : (
                    <MobileBtn label="출고취소" tone="amber" onClick={() => handleCancelRelease(o)} />
                  )}
                  {o.status === 'INBOUND' ? (
                    <MobileBtn label="정산" onClick={() => setBillingTarget(o)} />
                  ) : (
                    <MobileBtn label="정산 보기" onClick={() => setBillingTarget(o)} />
                  )}
                  <MobileBtn label="수정" onClick={() => setEditTarget(o)} />
                  {isAdmin && <MobileBtn label="삭제" tone="danger" onClick={() => handleDelete(o)} />}
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
        /* 재조회는 EditOrderModal 이 emit 하는 orderSync 를 이 페이지가 구독해 처리한다(중복 호출 없음) */
        onDone={() => setEditTarget(null)}
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
export function OrderBillingModal({ target, isAdmin, onClose }: { target: StorageOrder | null; isAdmin: boolean; onClose: () => void }) {
  const [ledgers, setLedgers] = useState<BillingLedger[]>([])
  const [loading, setLoading] = useState(true)
  // [단순화] 이 화면은 회차의 날짜·금액을 빠르게 바로잡는 용도다 — 입금·조정·환불 같은
  //   '정산서' 내용은 다루지 않는다(전역 '정산 관리' 화면에서). 그래서 행을 탭하면 팝업
  //   대신 곧장 날짜·금액 수정 폼만 그 자리에서 펼쳐진다.
  const [expandedLedgerId, setExpandedLedgerId] = useState<number | null>(null)
  // [지난 이력 아코디언] 완납된 과거 회차는 기본적으로 접어 스크롤 피로를 없앤다.
  const [historyOpen, setHistoryOpen] = useState(false)
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
      setExpandedLedgerId(null)
      setHistoryOpen(false)
      load(target.id)
    }
    // [초기화 방지] target은 60초 자동 새로고침·orderSync 갱신 때마다 내용이 같아도 새
    //   객체로 교체된다(OrdersPage의 billingTarget 스냅샷 갱신) — 객체 참조가 아니라
    //   id로만 걸어야 그때마다 펼친 회차·"이전 이력 보기"가 리셋되지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  if (!target) return null

  // 다음 청구 회차 기본값 프리필: 시작 = 마지막 회차 종료 다음날(없으면 계약 시작일), 종료 = +1개월
  function openGenerator() {
    const last = [...ledgers].sort((a, b) => (a.periodEnd < b.periodEnd ? -1 : 1)).at(-1)
    const start = last ? addDays(last.periodEnd, 1) : (target!.storageStartDate ?? today())
    setGenStart(start)
    setGenEnd(addMonths(start, target!.billingCycleMonths ?? 1))
    setGenAmount(target!.monthlyFee ?? null)
    setGenDue(start) // 선납 기준 납기 = 기간 시작일 (필요 시 조정)
    setGenError(null)
    setGenOpen(true)
  }

  // 청구서 생성 — 서버가 생성과 동시에 발행까지 끝내므로(createLedger) 별도 발행 호출이 필요 없다
  async function submitGenerate(e: FormEvent) {
    e.preventDefault()
    if (!genStart || !genEnd) return setGenError('청구 기간을 입력하세요.')
    if (genAmount == null || genAmount <= 0) return setGenError('청구 금액을 입력하세요.')
    if (genEnd < genStart) return setGenError('종료일은 시작일보다 빠를 수 없습니다.')
    // [출고일 초과 경고] 예정 출고일이 정해진(미정이 아닌) 계약인데 새 회차가 그 이후까지
    // 청구되면 — 이미 나가기로 한 계약에 실수로 회차를 더 만드는 걸 미리 확인시킨다.
    // 미정 계약(expectedEndDate 없음)은 계속 연장되는 게 정상이라 경고하지 않는다.
    if (target!.expectedEndDate && genEnd > target!.expectedEndDate) {
      if (
        !window.confirm(
          `이 계약의 예정 출고일은 ${target!.expectedEndDate}인데, 새 회차 종료일(${genEnd})이 그 이후입니다.\n계속 진행할까요?`,
        )
      ) {
        return
      }
    }
    setCreating(true)
    try {
      await billingApi.createLedger({
        storageOrderId: target!.id,
        billingType: 'MONTHLY',
        settlementType: 'PREPAID',
        periodStart: genStart,
        periodEnd: genEnd,
        baseAmount: genAmount,
        dueDate: genDue || undefined,
      })
      setGenOpen(false)
      load(target!.id)
      // [보관기간 동기화] 회차 청구로 계약 종료일이 확장됐을 수 있으니 계약·달력 갱신
      orderSync.emit()
    } catch (err) {
      setGenError(errMsg(err, '정산서 생성에 실패했습니다.'))
    } finally {
      setCreating(false)
    }
  }

  const totalBalance = ledgers.reduce((s, l) => s + (isOpenLedger(l) ? l.balance : 0), 0)
  // [보관료] 남은 미수 잔액이 아니라 진행 중인 회차의 정산금액(청구 총액)을 보여준다 —
  // 부분입금 후에도 "얼마 남았나"가 아니라 "원래 보관료가 얼마였나"가 보이게.
  const totalDue = ledgers.reduce(
    (s, l) => s + (isOpenLedger(l) ? l.baseAmount + l.carriedOverIn + l.adjustmentTotal : 0),
    0,
  )
  const paidCount = ledgers.filter((l) => l.balance <= 0).length
  // [스크롤 압축] 최근 3회차는 상태와 무관하게 항상 펼쳐 보여주고, 그보다 이전 회차만
  // 아코디언에 접어둔다 — 완납 여부로 가르지 않고 순수하게 "최근 것"만 늘 보이게 한다.
  const recentLedgers = ledgers.slice(-3)
  const olderLedgers = ledgers.slice(0, -3)
  const indexById = new Map(ledgers.map((l, i) => [l.id, i]))

  return (
    <>
      <Modal open onClose={onClose} title={`${target.customerName} · 정산 이력`} widthClass="max-w-2xl">
        <div className="space-y-3">
          {/* [좌우 밸런스] 계약기간에 더 넓은 칸을 주고 짧은 날짜 포맷을 써서 한 줄로 다
              들어가게 하고, 보관료는 좁은 칸에 오른쪽 정렬로 맞춘다. */}
          <div className="grid grid-cols-[3fr_2fr] gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">계약 기간</p>
              <p className="mt-0.5 whitespace-nowrap font-medium text-slate-700">
                <DateRangeLabel
                  start={target.storageStartDate}
                  end={target.actualEndDate ?? target.expectedEndDate}
                  format={md}
                />
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-xs text-slate-400">보관료</p>
              <p className={cn('mt-0.5 font-semibold', totalBalance > 0 ? 'text-[#A65B44]' : 'text-[#5C7C6B]')}>
                {totalDue > 0 ? won(totalDue) : '미수 없음'}
              </p>
            </div>
            {ledgers.length > 0 && (
              <p className="col-span-2 text-xs text-slate-400">
                {ledgers.length}회차 중 {paidCount}회 완납
              </p>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 className="animate-spin" size={16} />
              <span className="text-sm">정산 이력을 불러오는 중…</span>
            </div>
          )}

          {!loading && ledgers.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              아직 생성된 정산서가 없습니다.
              {isAdmin ? ' 아래 "다음 회차 정산 생성"으로 이번 회차를 만들면 바로 입금을 기록할 수 있습니다.' : ' 정산서는 매월 1일 자동 생성됩니다.'}
            </p>
          )}

          {/* [최근 3회차] 상태와 무관하게 항상 펼쳐서 보여준다 — 가장 최근 회차가 위로 오도록
              날짜 오름차순 배열(ledgers)을 뒤집어서 렌더한다. */}
          {!loading && recentLedgers.length > 0 && (
            <ol className="space-y-2">
              {[...recentLedgers].reverse().map((l) => (
                <LedgerRow
                  key={l.id}
                  ledger={l}
                  label={`${indexById.get(l.id)! + 1}회차`}
                  isAdmin={isAdmin}
                  expanded={expandedLedgerId === l.id}
                  isOnlyLedger={ledgers.length === 1}
                  lockStartDate={indexById.get(l.id) === 0 ? (target.storageStartDate ?? undefined) : undefined}
                  onToggle={() => setExpandedLedgerId((cur) => (cur === l.id ? null : l.id))}
                  onCollapse={() => setExpandedLedgerId(null)}
                  onChanged={() => load(target.id)}
                />
              ))}
            </ol>
          )}

          {/* [이전 이력] 최근 3회차보다 앞선 회차 — 기본 접힘, 스크롤 피로 제거.
              펼친 상태에선 위쪽 토글 버튼을 숨기고 목록 맨 아래에 "접기" 버튼만 둔다 —
              펼친 목록 중간에 버튼이 끼어 있으면 헷갈린다. */}
          {!loading && olderLedgers.length > 0 && (
            <div>
              {!historyOpen && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 py-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                  <ChevronDown size={18} />
                  이전 정산 이력 보기 ({olderLedgers.length}건)
                </button>
              )}
              {historyOpen && (
                <>
                  <ol className="space-y-2">
                    {[...olderLedgers].reverse().map((l) => (
                      <LedgerRow
                        key={l.id}
                        ledger={l}
                        label={`${indexById.get(l.id)! + 1}회차`}
                        isAdmin={isAdmin}
                        expanded={expandedLedgerId === l.id}
                        isOnlyLedger={false}
                        lockStartDate={indexById.get(l.id) === 0 ? (target.storageStartDate ?? undefined) : undefined}
                        onToggle={() => setExpandedLedgerId((cur) => (cur === l.id ? null : l.id))}
                        onCollapse={() => setExpandedLedgerId(null)}
                        onChanged={() => load(target.id)}
                      />
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(false)}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 py-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                  >
                    <ChevronDown size={18} className="rotate-180" />
                    접기
                  </button>
                </>
              )}
            </div>
          )}

          {/* [다음 회차 생성] 목록 맨 아래 — 점선 버튼 대신 명확한 대형 버튼 */}
          {isAdmin && !genOpen && !loading && (
            <button
              type="button"
              onClick={openGenerator}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white transition active:scale-[0.99]"
            >
              <Plus size={18} /> 다음 회차 정산 생성
            </button>
          )}
          {genOpen && (
            <form onSubmit={submitGenerate} className="space-y-2.5 rounded-xl bg-indigo-50/40 p-3.5 ring-1 ring-indigo-200/60">
              <p className="text-xs font-semibold text-slate-600">정산서 생성 · 생성하면 바로 입금을 기록할 수 있습니다</p>
              <FieldGrid>
                {/* [갭·중복 원천 차단] 시작일은 항상 "직전 회차 종료일 다음날"로 자동 계산되고
                    고정된다 — 직접 입력하게 두면 실수로 겹치거나 비는 날짜를 넣을 수 있다. */}
                <GridField label="청구 시작일" hint="자동 계산 (직전 회차 다음날)">
                  <div className={gridReadonlyCls}>{md(genStart)}</div>
                </GridField>
                <GridField label="청구 종료일">
                  <CalendarField
                    value={genEnd}
                    onChange={setGenEnd}
                    min={genStart || undefined}
                    className={gridInputCls}
                  />
                </GridField>
                <GridField label="청구 금액">
                  <MoneyInput value={genAmount} onChange={setGenAmount} required className={cn(gridInputCls, 'pr-8')} />
                </GridField>
                <GridField label="납기일">
                  <CalendarField value={genDue} onChange={setGenDue} className={gridInputCls} />
                </GridField>
              </FieldGrid>
              {genError && <p className="text-xs text-red-600">{genError}</p>}
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setGenOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-white">
                  취소
                </button>
                <button type="submit" disabled={creating} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
                  {creating ? '생성 중…' : '정산서 생성'}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </>
  )
}

/* ===== 계약 등록 ===== */
export function CreateOrderModal({
  open,
  onClose,
  customers,
  warehouses,
  onCustomerAdded,
  onDone,
  fixedSlot,
  defaultStartDate,
}: {
  open: boolean
  onClose: () => void
  customers: Customer[]
  warehouses: Warehouse[]
  onCustomerAdded: (c: Customer) => void
  onDone: () => void
  // [통합] 컨테이너 관리에서 빈 자리 입고로 열 때: 이 슬롯의 창고·자리로 자동 고정(변경 불가)
  fixedSlot?: { id: number; warehouseId: number; warehouseName: string; locationLabel: string; tier: number } | null
  // [일정 화면 진입] 특정 날짜 칸에서 "계약 등록"으로 열 때만 그 날짜를 보관 시작일에 미리 채운다.
  //   그 외 경로는 기존 원칙(수동 입력)을 그대로 유지한다.
  defaultStartDate?: string
}) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [warehouseId, setWarehouseId] = useState('')
  const [slotId, setSlotId] = useState<number | null>(null) // 선택 슬롯(null=미지정)
  // [수동 입력 원칙] 날짜 3종(보관 시작일·출고 예정일·납기일)은 기본값 없이 빈 값으로 시작한다.
  //   자동 프리필은 담당자가 확인 없이 저장할 여지를 만들어 계약 기간·납기 오류의 원인이 되므로 제거.
  const [storageStartDate, setStartDate] = useState('')
  const [expectedEndDate, setEndDate] = useState('')
  const [endDateUnknown, setEndDateUnknown] = useState(false) // 출고일 미정(장기 보관) 명시적 선택
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  const [capacityTons, setCapacityTons] = useState<number | null>(null) // 보관 용량(톤)
  const [paymentType, setPaymentType] = useState<PaymentType>('PREPAID')
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('BANK_TRANSFER') // 결제 수단 기본 계좌이체
  const [dueDate, setDueDate] = useState('')
  const [settlementUserId, setSettlementUserId] = useState<number | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  // [정산서 생성 방식] 기본값은 수동 생성 — 담당자가 명시적으로 켜야만 매월 자동 청구가 시작된다.
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(false)
  // [정산서 생성 주기] 자동 생성일 때만 의미 있음 — 기본값 1개월
  const [billingCycleMonths, setBillingCycleMonths] = useState(1)
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [custOpen, setCustOpen] = useState(false)
  const [dormantConfirm, setDormantConfirm] = useState(false)

  // [읽기 전용 파생값] 날짜 두 값에서 보관일수(당일 포함)를 도출한다.
  //   입력 필드를 건드리지 않고 화면 표기용으로만 쓰므로, 사용자가 입력한 값이 덮어써질 일이 없다.
  const days = useMemo(() => storageDays(storageStartDate, expectedEndDate), [storageStartDate, expectedEndDate])

  // [보관일수 미확정 시 임시 보관] 출고예정일 '미정' 등으로 보관일수를 계산할 수 없으면
  //   monthlyFee를 역산할 수 없어 입력값을 어디에도 반영 못 하고 그대로 잃어버렸다(커서만
  //   깜빡이고 입력이 안 되는 버그). 그 사이엔 타이핑한 값을 여기 임시로 들고 있다가,
  //   날짜가 확정되는 순간 아래 effect가 자동으로 반영한다.
  const [dailyFeeDraft, setDailyFeeDraft] = useState<number | null>(null)

  // [읽기 전용 파생값] 하루 보관료 = 보관료 ÷ 보관일수(당일 포함).
  //   보관일수가 확정됐을 때만 monthlyFee 에서 파생해 보여주고, 미확정이면 임시 입력값을 그대로 보여준다.
  const dailyFee = useMemo(
    () => (days == null ? dailyFeeDraft : calcDailyFee(monthlyFee, storageStartDate, expectedEndDate)),
    [days, dailyFeeDraft, monthlyFee, storageStartDate, expectedEndDate],
  )

  // [지연 반영] 보관일수가 미확정 → 확정으로 바뀌는 순간, 대기 중이던 하루 보관료 임시값이 있으면
  //   그걸로 보관료를 채운다. 한 번 반영하면 draft를 비워 이후엔 정상적인 파생 표시로 넘어간다.
  useEffect(() => {
    if (days == null || dailyFeeDraft == null || dailyFeeDraft <= 0) return
    const computed = calcMonthlyFeeFromDaily(dailyFeeDraft, storageStartDate, expectedEndDate)
    if (computed != null) {
      setMonthlyFee(computed)
      setDailyFeeDraft(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const isBlacklisted = selectedCustomer?.status === 'BLACKLISTED'
  const isDormant = selectedCustomer?.status === 'DORMANT'

  useEffect(() => {
    if (open) {
      setSelectedCustomer(null)
      // [통합] 컨테이너 관리 입고로 열렸으면 그 창고·자리로 고정, 아니면 기본 창고 + 미지정
      if (fixedSlot) {
        setWarehouseId(String(fixedSlot.warehouseId))
        setSlotId(fixedSlot.id)
      } else {
        setWarehouseId(warehouses[0] ? String(warehouses[0].id) : '')
        setSlotId(null)
      }
      // 날짜 3종은 기본값 없이 초기화 — 담당자가 매 계약마다 명시적으로 입력한다
      // (예외: 일정 화면에서 특정 날짜 칸을 짚어 등록을 열었을 때만 그 날짜를 보관 시작일에 미리 채운다)
      setStartDate(defaultStartDate ?? '')
      setEndDate('')
      setEndDateUnknown(false)
      setMonthlyFee(null)
      setDailyFeeDraft(null)
      setCapacityTons(null)
      setPaymentType('PREPAID')
      setPaymentMethod('BANK_TRANSFER')
      setSettlementUserId(null)
      setDueDate('')
      setAutoBillingEnabled(false)
      setBillingCycleMonths(1)
      setMemo('')
      setFormError(null)
      setDormantConfirm(false)
    }
    // [입력값 보호] warehouses를 deps에 넣으면 안 된다 — 페이지의 60초 자동 새로고침·orderSync
    //   이벤트가 배열을 새로 만들 때마다(내용이 같아도) 이 effect가 다시 돌아 폼을 전부 초기화해버렸다
    //   (실측: 등록 폼을 채우던 중 "갑자기" 값이 사라지는 버그). 기본 창고값은 열리는 시점의
    //   warehouses를 그대로 읽기만 하면 되므로, open이 새로 켜질 때만 반응하면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedSlot, defaultStartDate])

  // [수납 계좌] 직원 목록 로드 (계좌이체 시 담당 직원 선택용) — 권한 없으면 빈 목록
  useEffect(() => {
    if (!open) return
    let alive = true
    staffApi.list().then((s) => alive && setStaffList(s)).catch(() => alive && setStaffList([]))
    return () => {
      alive = false
    }
  }, [open])

  // [보관료 수동 입력] 층 단가 × 보관일수 기반 자동 계산은 제거됐다.
  //   보관료는 담당자가 직접 입력한 값만 저장되며, 날짜·위치를 바꿔도 금액이 바뀌지 않는다.
  //   다만 "하루 보관료"는 예외로 입력 가능하게 열어뒀다 — 그 값을 입력하는 순간에만
  //   보관료 = 하루 보관료 × 보관일수로 채워주고, 그 뒤로는 보관료 필드를 그대로 직접 수정해도 된다.
  function handleDailyFeeChange(v: number | null) {
    // [임시값 갱신] 보관일수가 아직 미확정이면 이 값을 그대로만 들고 있는다(위 dailyFeeDraft 참고) —
    //   그래야 날짜 미정 상태에서도 타이핑한 값이 화면에 그대로 보인다.
    setDailyFeeDraft(v)
    if (days == null) return
    // [빈 값 전파] 이 칸은 자체 상태 없이 monthlyFee 에서 파생된 값을 보여준다.
    //   비웠을 때 아무것도 안 하면 monthlyFee 가 그대로 남아 파생값이 즉시 되살아나고,
    //   결과적으로 마지막 한 자리가 지워지지 않는다. 두 값은 같은 금액의 두 표현이므로
    //   한쪽을 비우면 다른 쪽도 비운다. (0 이하도 유효한 금액이 아니라 같이 취급)
    if (v == null || v <= 0) {
      setMonthlyFee(null)
      return
    }
    const computed = calcMonthlyFeeFromDaily(v, storageStartDate, expectedEndDate)
    if (computed != null) setMonthlyFee(computed)
  }

  const periodError = validateContractPeriod(storageStartDate, expectedEndDate)
  // [예약 계약] 보관 시작일이 미래면 아직 실제로 입고된 게 아니므로 컨테이너를 물리적으로 배치할 수 없다
  //   (백엔드가 "입고일은 오늘 이후로 지정할 수 없습니다"로 막는다) — 그 자리에서 바로 자리를 배정하는 대신
  //   입고일이 되면 컨테이너 관리 화면에서 배치하도록 안내한다.
  const isFutureStart = storageStartDate !== '' && storageStartDate > today()

  // [예약 계약 방어] 날짜를 미래로 바꾸는 순간 이미 골라둔 자리 선택은 무효화한다
  //   (자리 선택 UI는 아래에서 숨기지만, 상태값이 남아있으면 제출 시 배치를 시도해 같은 오류가 난다)
  useEffect(() => {
    if (isFutureStart) setSlotId(null)
  }, [isFutureStart])

  function validate(): boolean {
    if (!selectedCustomer) {
      setFormError('고객을 선택하세요.')
      return false
    }
    if (!warehouseId) {
      setFormError('창고를 선택하세요.')
      return false
    }
    // [필수값 방어] 캘린더 선택기는 네이티브 input이 아니라 HTML5 required가 자동으로 걸리지 않는다
    if (!storageStartDate) {
      setFormError('보관 시작일을 입력하세요.')
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
        autoBillingEnabled,
        billingCycleMonths,
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
      <Modal
        open={open}
        onClose={onClose}
        title="계약 등록"
        widthClass="max-w-5xl"
        footer={
          <FormActions
            formId="create-order-form"
            onCancel={onClose}
            submitting={submitting}
            disabled={isBlacklisted || periodError != null}
            submitLabel="등록 완료"
            submittingLabel="등록 중…"
          />
        }
      >
        <form id="create-order-form" onSubmit={handleSubmit} className="space-y-4">
          {/* 단일 컬럼: 고객 → 고객 검색 → 창고 → 위치 → 일정 순 */}
          <div className="space-y-4">

            
            {fixedSlot ? (
              /* [통합] 컨테이너 관리에서 입고: 창고·자리 자동 고정(변경 불가) */
              <div>
                <label className={labelCls}>창고 · 위치</label>
                <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-3">
                  <span className="text-base font-semibold text-slate-800 md:text-sm">
                    {fixedSlot.warehouseName} · {fixedSlot.locationLabel}
                  </span>
                  <span className="ml-auto shrink-0 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-500">자동 선택</span>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className={labelCls}>창고 *</label>
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
                  <label className={labelCls}>컨테이너 위치 지정</label>
                  {isFutureStart ? (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
                      보관 시작일이 아직 오지 않은 예약 계약입니다. 입고일이 되면 컨테이너 관리 화면에서 자리를 배정해주세요.
                    </p>
                  ) : (
                    <LocationPickerField
                      warehouseId={warehouseId ? Number(warehouseId) : null}
                      value={slotId}
                      onChange={setSlotId}
                    />
                  )}
                </div>
              </>
            )}

            <div>
              <label className={labelCls}>고객 *</label>
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
                <p className="rounded-lg border border-dashed border-slate-300 px-3.5 py-3 text-base text-slate-400 md:py-2 md:text-sm">
                  아래 목록에서 고객을 검색해 선택하세요.
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

            {/* 고객 검색 — 고객 아래·창고 위 */}
            <div>
              <label className={labelCls}>고객 검색</label>
              <CustomerListPicker
                customers={customers}
                selectedId={selectedCustomer?.id ?? null}
                onSelect={setSelectedCustomer}
                onQuickAdd={() => setCustOpen(true)}
                heightClass="h-64"
              />
            </div>

            <FieldGrid>
              <GridField label="보관 시작일" required>
                <CalendarField
                  value={storageStartDate}
                  onChange={setStartDate}
                  // [즉시 배치 전제] 빈 자리를 탭해 들어온 입고 등록은 "지금 물리적으로 놓는" 흐름이라
                  //   미래 날짜를 고르면 배치 시점에 항상 실패한다 — 애초에 오늘 이전으로만 고르게 막는다.
                  max={fixedSlot ? today() : undefined}
                  className={gridInputCls}
                />
              </GridField>
              {/* '미정' 스위치는 라벨 줄 오른쪽에 — 입력창 높이를 다른 칸과 같게 유지한다 */}
              <GridField
                label="출고 예정일"
                action={
                  <UndecidedToggle
                    checked={endDateUnknown}
                    onChange={(v) => {
                      setEndDateUnknown(v)
                      if (v) setEndDate('') // 미정 선택 시 기존 입력값 제거
                    }}
                  />
                }
              >
                {endDateUnknown ? (
                  <UndecidedPlaceholder />
                ) : (
                  <CalendarField
                    value={expectedEndDate}
                    onChange={setEndDate}
                    min={storageStartDate || undefined}
                    className={cn(gridInputCls, periodError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
                  />
                )}
              </GridField>
            </FieldGrid>

            {/* 날짜 오류는 원인이 되는 보관 시작일·출고 예정일 바로 아래에 둔다 */}
            {periodError && (
              <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {periodError}
              </p>
            )}

            <FieldGrid>
              <GridField label="보관료" required>
                <MoneyInput
                  value={monthlyFee}
                  onChange={setMonthlyFee}
                  required
                  placeholder="예: 300,000"
                  className={cn(gridInputCls, 'pr-8', monthlyFee != null && monthlyFee > 0 && 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100')}
                />
              </GridField>
              <GridField label="보관 용량 (톤)">
                <div className="relative min-w-0">
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={capacityTons ?? ''}
                    onChange={(e) => setCapacityTons(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="예: 2.5"
                    className={cn(gridInputCls, 'pr-8')}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">톤</span>
                </div>
              </GridField>
              {/* 읽기 전용 — 보관 시작일·출고 예정일이 모두 유효할 때만 표시(당일 포함) */}
              <GridField label="보관일수" hint="보관 시작일 ~ 출고 예정일 (당일 포함)">
                <div className={gridReadonlyCls}>{days != null ? `${days.toLocaleString()}일` : ''}</div>
              </GridField>
              {/* 보관료÷보관일수를 실시간으로 보여주되, 여기에 직접 입력하면 반대로
                  보관료 = 입력값 × 보관일수로 자동 채워진다(층 단가표 등으로 하루 단가를
                  먼저 아는 경우를 위함). 보관일수 미확정 시엔 입력해도 반영되지 않는다. */}
              <GridField label="하루 보관료" hint="입력하면 보관료 = 입력값 × 보관일수로 자동 계산">
                <MoneyInput
                  value={dailyFee}
                  onChange={handleDailyFeeChange}
                  placeholder="예: 6,000"
                  className={cn(gridInputCls, 'pr-8')}
                />
              </GridField>
            </FieldGrid>

            <FieldGrid>
              <GridField label="결제 방식" required>
                <select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className={gridInputCls}>
                  <option value="PREPAID">선불 (당일 완납)</option>
                  <option value="POSTPAID">후불</option>
                </select>
              </GridField>
              <GridField label="결제 수단" required>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)} className={gridInputCls}>
                  <option value="BANK_TRANSFER">계좌이체</option>
                  <option value="CASH">현금</option>
                  <option value="CARD">카드</option>
                </select>
              </GridField>
            </FieldGrid>
            {/* 짝이 없는 단독 필드라 2열 그리드에 반쪽으로 남기지 않고 전체 폭으로 — 다른 단독 필드(메모 등)와 통일 */}
            <Field label="납기일">
              <CalendarField value={dueDate} onChange={setDueDate} className={inputCls} />
            </Field>
            {/* [계좌 연동] 계좌이체일 때만 입금 계좌(담당 직원) 지정 폼 노출 */}
            {paymentMethod === 'BANK_TRANSFER' && (
              <PaymentAccountPicker
                staffList={staffList}
                value={settlementUserId}
                onChange={setSettlementUserId}
              />
            )}

            <AutoBillingToggle
              checked={autoBillingEnabled}
              onChange={setAutoBillingEnabled}
              dueDate={dueDate}
              cycleMonths={billingCycleMonths}
              onCycleMonthsChange={setBillingCycleMonths}
            />

            <div>
              <label className={labelCls}>메모</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={2}
                placeholder="계약 특이사항이나 부대 정보를 자유롭게 입력하세요."
                className={cn(inputCls, 'min-h-[64px] w-full resize-y leading-relaxed')}
              />
            </div>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
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
          <label className={labelCls}>고객명 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>유형</label>
            <select value={customerType} onChange={(e) => setType(e.target.value as CustomerType)} className={inputCls}>
              <option value="INDIVIDUAL">개인</option>
              <option value="CORPORATE">기업</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>연락처</label>
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

export function StatusChangeModal({
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
                  <label className={labelCls}>실제 출고일</label>
                  <CalendarField
                    value={actualEndDate}
                    onChange={setActualEndDate}
                    min={target.storageStartDate}
                    max={target.expectedEndDate ?? undefined}
                    format={ymdKorean}
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
                      실사용 기간 <span className="font-medium text-slate-700">{ymdKorean(target.storageStartDate)} ~ {actualEndDate ? ymdKorean(actualEndDate) : ''} ({usedDays}일)</span>
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
                <label className={labelCls}>실제 입고일</label>
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

/** [공용] 계약 위치 배지 — 테이블 셀과 모바일 카드가 동일 렌더를 공유(중복 제거)
 *  overdue: 입고일이 지났는데도 미배치인 경우 중립 배지 대신 경고색으로 눈에 띄게 한다. */
function OrderLocationBadge({ locs, overdue }: { locs: string[]; overdue?: boolean }) {
  if (locs.length === 0)
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-medium',
          overdue
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-dashed border-[#E2DCD1] bg-[#EFEBE4]/60 text-[#8A8172]',
        )}
      >
        {overdue && <AlertTriangle size={13} />}
        위치 미지정
      </span>
    )
  return (
    <span title={locs.join(', ')} className="inline-flex items-center gap-1.5">
      <span className="rounded bg-slate-100 px-2 py-1 text-sm font-medium text-slate-600">{locs[0]}</span>
      {locs.length > 1 && <span className="text-sm text-slate-400">외 {locs.length - 1}</span>}
    </span>
  )
}

/** [공용] 출고 지연 배지 — 출고 예정일이 지났는데 아직 출고 처리가 안 된 계약에 표시 */
function OutboundOverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
      <AlertTriangle size={11} /> 출고 지연
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


function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}
