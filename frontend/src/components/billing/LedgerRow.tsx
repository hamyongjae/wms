import type { MouseEvent, ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { Pencil, Trash2 } from 'lucide-react'
import { billingApi, type BillingLedger } from '@/api/billingApi'
import { cn } from '@/lib/cn'
import { orderSync } from '@/lib/orderEvents'
import { displayStatus } from '@/lib/billing'
import { md } from '@/lib/dates'
import DateRangeLabel from '@/components/ui/DateRangeLabel'
import ScheduleEditForm from '@/components/billing/ScheduleEditForm'

/**
 * [정산 회차 행 — 단일 공용 템플릿] 회차 하나(상태·기간·금액)를 보여주고, 탭하면
 * 그 자리에서 날짜·금액 수정 폼이 펼쳐진다. 입금·조정·납기일변경·환불·이력 같은
 * '정산서' 내용은 다루지 않는다 — 이 카드는 날짜·금액을 빠르게 바로잡는 용도다.
 * 계약별 '정산 이력'(OrdersPage)과 전역 '매출 관리'(BillingPage) 양쪽에서 그대로
 * 가져다 쓴다. `label`만 호출부가 정한다(회차 번호 또는 고객명).
 */

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}

export default function LedgerRow({
  ledger: l,
  label,
  isAdmin,
  expanded,
  isOnlyLedger,
  lockStartDate,
  onToggle,
  onCollapse,
  onChanged,
}: {
  ledger: BillingLedger
  /** 행 좌상단에 보이는 식별 텍스트 — 계약별 화면은 "N회차", 매출 관리는 고객명 */
  label: ReactNode
  isAdmin: boolean
  expanded: boolean
  /** 이 계약에 회차가 이거 하나뿐인지 — 지우면 정산 이력이 통째로 사라지니 안내를 다르게 한다 */
  isOnlyLedger?: boolean
  /** [1회차 잠금] 값이 있으면 이 회차가 1회차라는 뜻 — 정산 시작일을 이 값으로 고정한다 */
  lockStartDate?: string
  onToggle: () => void
  onCollapse: () => void
  onChanged: () => void
}) {
  const ds = displayStatus(l)
  const canEdit = isAdmin && l.status !== 'CARRIED_OVER' && l.status !== 'CANCELED'
  // [삭제] 입금 기록이 있어도 삭제 가능 — 서버가 원장과 함께 그 입금 이력도 지운다.
  //   이월된 원장만 막는다(그 다음 원장의 이월액과 정합이 깨지므로) — canEdit과 동일 조건.
  const canDelete = canEdit
  const totalDue = l.baseAmount + l.carriedOverIn + l.adjustmentTotal
  // [버그 수정] 청구액이 0이어도 실제 입금액(paidTotal)이 있으면 "청구 없음" 고정 문구로
  //   가리면 안 된다 — 그러면 이런 회차에서 입금액을 정정해도 화면에 반영이 안 된 것처럼
  //   보인다(실제로는 저장됨). 청구·입금 둘 다 0일 때만 "청구 없음"으로 취급한다.
  const isNoCharge = totalDue === 0 && l.paidTotal === 0
  // [과거 이력 묶음] 처음부터 청구액 0원으로 만들어진 소급분과, 실제 청구했다가 나중에
  //   전액 조정(할인)으로 0원이 된 회차는 다르다 — 라벨을 구분해 오해를 없앤다.
  const isOriginallyZero = l.baseAmount === 0 && l.carriedOverIn === 0
  const hasBalance = l.balance > 0

  async function handleDelete(e: MouseEvent) {
    e.stopPropagation()
    // [단일 회차 경고] 이게 이 계약의 유일한 회차라면 지우는 순간 정산 이력이 통째로
    // 사라진다 — 계약 자체를 잘못 등록한 거라면 여기서 지우지 말고 계약 삭제로 유도한다.
    const onlyLedgerNotice = isOnlyLedger
      ? '이 계약의 유일한 정산 회차입니다. 삭제하면 정산 이력이 전부 사라집니다.\n계약 자체를 잘못 등록하신 거라면 여기서 지우지 말고 "계약 관리"에서 계약을 삭제해주세요.\n\n'
      : ''
    // [입금 경고] 입금 기록이 있는 회차를 지우면 그 입금 이력도 함께 사라진다 — 삭제 전에 분명히 알린다.
    const paidNotice =
      l.paidTotal > 0 ? `이 회차에는 ${won(l.paidTotal)} 입금 기록이 있습니다. 삭제하면 그 입금 기록도 함께 사라집니다.\n\n` : ''
    const msg = `${onlyLedgerNotice}${paidNotice}${onlyLedgerNotice ? '그래도 이 회차만' : '정말 이 정산 스케줄을'} 삭제하시겠습니까?`
    if (!window.confirm(msg)) return
    try {
      await billingApi.remove(l.id)
      onChanged()
      orderSync.emit()
    } catch (err) {
      window.alert(errMsg(err, '삭제에 실패했습니다.'))
    }
  }

  return (
    <li>
      <div
        className={cn(
          'flex w-full items-center gap-1.5 rounded-xl border-l-4 bg-white p-3.5 ring-1 ring-slate-200/70 transition hover:bg-slate-50',
          ds.accent,
          isNoCharge && 'bg-slate-50/60 opacity-70',
        )}
      >
        <button
          type="button"
          onClick={canEdit ? onToggle : undefined}
          className="flex min-w-0 flex-1 flex-col gap-1 text-left"
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-xs font-semibold text-slate-400">{label}</span>
            <span className={cn('inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1', ds.cls)}>
              {ds.label}
            </span>
          </span>
          {/* [한 줄 고정] 우측 수정·삭제 버튼에 밀려 두 줄로 깨지지 않도록 짧은 날짜
              포맷(점 표기)을 쓰고 줄바꿈 자체를 막는다. */}
          <span className="whitespace-nowrap text-sm font-medium text-slate-700">
            <DateRangeLabel start={l.periodStart} end={l.periodEnd} format={md} />
          </span>
          <span className="text-sm">
            {isNoCharge ? (
              <span className="text-xs text-slate-400">
                {isOriginallyZero ? '실사용 이전 이력 · 청구 없음' : '전액 조정 · 청구 없음'}
              </span>
            ) : (
              <span className={cn('font-semibold', hasBalance ? 'text-[#A65B44]' : 'text-slate-400')}>
                {won(l.paidTotal)}
                <span className={hasBalance ? 'text-[#C99C8F]' : 'text-slate-300'}> / </span>
                {won(totalDue)}
              </span>
            )}
          </span>
        </button>
        {/* [잘 보이는 버튼] 옅은 화살표 대신 테두리·배경이 있는 명확한 버튼으로 — 60대
            사용자도 "여기 누르면 된다"를 바로 알 수 있게. */}
        <div className="flex shrink-0 items-center gap-1.5">
          {canEdit && (
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 transition',
                expanded
                  ? 'bg-amber-100 text-amber-700 ring-amber-300'
                  : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50',
              )}
              title="일정 수정"
            >
              <Pencil size={14} />
              수정
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 transition hover:bg-red-50"
              title="삭제"
            >
              <Trash2 size={14} />
              삭제
            </button>
          )}
        </div>
      </div>
      {l.carriedOverIn > 0 && (
        <p className="mt-1 pl-1 text-[11px] text-slate-400">전 회차 이월 미수 {won(l.carriedOverIn)} 포함</p>
      )}
      {expanded && canEdit && (
        <ScheduleEditForm
          ledger={l}
          lockStartDate={lockStartDate}
          onDone={() => {
            onCollapse()
            onChanged()
          }}
          onCancel={onCollapse}
        />
      )}
    </li>
  )
}
