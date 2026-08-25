import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { AlertTriangle } from 'lucide-react'
import {
  orderApi,
  type StorageOrder,
  type PaymentType,
  type PaymentMethod as OrderPaymentMethod,
} from '@/api/orderApi'
import { staffApi, type Staff } from '@/api/staffApi'
import { containerApi, type Container } from '@/api/containerApi'
import { yardApi } from '@/api/yardApi'
import { cn } from '@/lib/cn'
import { validateContractPeriod } from '@/lib/dateValidation'
import { today } from '@/lib/dates'
import { calcDailyFee, calcMonthlyFeeFromDaily, storageDays } from '@/lib/fee'
import { placeContainerAtSlot } from '@/lib/containerPlacement'
import { orderSync } from '@/lib/orderEvents'
import Modal from '@/components/ui/Modal'
import MoneyInput from '@/components/ui/MoneyInput'
import LocationPickerField from '@/components/yard/LocationPickerField'
import PaymentAccountPicker from './PaymentAccountPicker'
import {
  AutoBillingToggle,
  CalendarField,
  ContextBar,
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
} from './orderFormUi'

const FORM_ID = 'edit-order-form'

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}

/** 컨테이너 관리(격자)에서 진입할 때 넘겨주는 사전 정보 */
export interface EditOrderEntryHint {
  slotId: number
  locationLabel: string
  container?: Container
}

/**
 * ===== [계약 수정 통합 팝업] =====
 *
 * 계약 관리의 '수정' 버튼과 컨테이너 관리 격자의 '보관 정보 수정'이 모두 이 하나의
 * 컴포넌트를 호출한다. 진입 경로가 달라도 화면은 완전히 동일하며, 시각 규격은
 * orderFormUi 의 공용 템플릿(계약 등록 화면 기준)을 그대로 상속받는다.
 *
 * 진입 경로별 차이는 오직 '무엇을 미리 알고 들어오느냐' 뿐이다.
 *  · 계약 관리 진입: 계약만 안다 → 배정된 컨테이너·자리를 이 컴포넌트가 조회해 채운다.
 *  · 컨테이너 관리 진입: 자리·컨테이너를 이미 안다 → hint 로 받아 조회 없이 즉시 표시하고,
 *    조회가 끝나면 서버 값으로 조용히 보정한다(로딩 깜빡임 제거).
 *
 * 저장은 [수정 완료] 한 번으로 계약·위치·컨테이너를 일괄 반영하고,
 * 완료 시 orderSync 로 전역 신호를 보내 계약 목록·격자 뷰·대시보드가 스스로 갱신되게 한다.
 */
export default function EditOrderModal({
  target,
  hint,
  onClose,
  onDone,
}: {
  /** 수정 대상 계약. null 이면 렌더하지 않는다. */
  target: StorageOrder | null
  /** [컨테이너 관리 진입] 격자에서 선택한 자리·컨테이너 — 조회 전 즉시 바인딩용 */
  hint?: EditOrderEntryHint | null
  onClose: () => void
  onDone: () => void
}) {
  const [storageStartDate, setStartDate] = useState('')
  const [expectedEndDate, setEndDate] = useState('')
  // [출고일 미정] 종료일이 확정되지 않은 장기 보관 건을 표현하는 스위치
  const [endDateUnknown, setEndDateUnknown] = useState(false)
  const [monthlyFee, setMonthlyFee] = useState<number | null>(null)
  // [보관일수 미확정 시 임시 보관] 출고예정일 '미정'이면 보관일수를 못 구해 monthlyFee를
  // 역산할 수 없다 — 그 사이 타이핑한 하루 보관료 값을 여기 들고 있다가 날짜 확정 시 자동 반영한다.
  const [dailyFeeDraft, setDailyFeeDraft] = useState<number | null>(null)
  const [capacityTons, setCapacityTons] = useState<number | null>(null)
  const [memo, setMemo] = useState('')
  const [paymentType, setPaymentType] = useState<PaymentType>('POSTPAID')
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>('BANK_TRANSFER')
  const [settlementUserId, setSettlementUserId] = useState<number | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [dueDate, setDueDate] = useState('')
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(false)
  const [billingCycleMonths, setBillingCycleMonths] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // 위치: 선택 슬롯 / 현재(원래) 슬롯 / 연결된 컨테이너
  const [slotId, setSlotId] = useState<number | null>(null)
  const [currentSlotId, setCurrentSlotId] = useState<number | null>(null)
  const [container, setContainer] = useState<Container | null>(null)

  // ===== 계약 원장 → 폼 바인딩 (두 진입 경로 공통) =====
  useEffect(() => {
    if (!target) return
    setStartDate(target.storageStartDate ?? '')
    setEndDate(target.expectedEndDate ?? '')
    // [방어 로직] 종료일이 비어 있으면 어떤 경로로 들어오든 '출고일 미정'이 자동으로 켜진다.
    setEndDateUnknown(target.expectedEndDate == null || target.expectedEndDate === '')
    setMonthlyFee(target.monthlyFee)
    setDailyFeeDraft(null)
    setCapacityTons(target.capacityTons)
    setMemo(target.memo ?? '')
    setPaymentType(target.paymentType ?? 'POSTPAID')
    setPaymentMethod(target.paymentMethod ?? 'BANK_TRANSFER')
    setSettlementUserId(target.settlementUserId ?? null)
    setDueDate(target.dueDate ?? '')
    setAutoBillingEnabled(target.autoBillingEnabled ?? false)
    setBillingCycleMonths(target.billingCycleMonths ?? 1)
    setFormError(null)
  }, [target])

  // [컨테이너 관리 진입] 이미 아는 자리·컨테이너를 즉시 반영 — 서버 조회를 기다리지 않는다
  useEffect(() => {
    setSlotId(hint?.slotId ?? null)
    setCurrentSlotId(hint?.slotId ?? null)
    setContainer(hint?.container ?? null)
  }, [hint?.slotId, hint?.container])

  // [입금 계좌] 담당 직원 목록 (계좌이체 시 선택용)
  useEffect(() => {
    if (!target) return
    let alive = true
    staffApi.list().then((s) => alive && setStaffList(s)).catch(() => alive && setStaffList([]))
    return () => {
      alive = false
    }
  }, [target])

  /**
   * [위치 자동 바인딩] 이 계약에 배정·적재된 컨테이너의 현재 자리를 서버에서 확인한다.
   * 계약 관리로 진입하면 이 조회가 유일한 위치 정보원이고,
   * 컨테이너 관리로 진입하면 힌트로 채워둔 값을 서버 기준으로 재확인하는 역할이다.
   */
  useEffect(() => {
    if (!target) return
    let alive = true
    Promise.all([containerApi.list({ warehouseId: target.warehouseId }), yardApi.slots(target.warehouseId)])
      .then(([containers, slots]) => {
        if (!alive) return
        const ct = containers.find((c) => c.currentOrderId === target.id)
        if (!ct) return
        setContainer(ct)
        const slot = slots.find((s) => s.containerId === ct.id)
        if (slot) {
          setCurrentSlotId(slot.id)
          // 사용자가 이미 다른 자리를 고르는 중이면 그 선택을 덮어쓰지 않는다
          setSlotId((prev) => prev ?? slot.id)
        }
      })
      .catch(() => undefined) // 위치는 부가 정보 — 실패해도 계약 수정은 계속 가능해야 한다
    return () => {
      alive = false
    }
  }, [target])

  // [예약 계약 방어] 보관 시작일을 미래로 바꾸는 순간 자리 이동 선택은 무효화한다(원래 자리로 되돌림).
  //   위치 지정 UI는 아래에서 숨기지만, 상태값이 남아있으면 제출 시 자리 이동을 시도해
  //   "입고일은 오늘 이후로 지정할 수 없습니다" 오류가 난다.
  useEffect(() => {
    if (storageStartDate !== '' && storageStartDate > today()) {
      setSlotId(currentSlotId)
    }
  }, [storageStartDate, currentSlotId])

  // [지연 반영] 보관일수가 미확정 → 확정으로 바뀌는 순간, 대기 중이던 하루 보관료 임시값이
  //   있으면 그걸로 보관료를 채운다. 반영 후엔 draft를 비워 정상적인 파생 표시로 넘어간다.
  useEffect(() => {
    const days = storageDays(storageStartDate, expectedEndDate)
    if (days == null || dailyFeeDraft == null || dailyFeeDraft <= 0) return
    const computed = calcMonthlyFeeFromDaily(dailyFeeDraft, storageStartDate, expectedEndDate)
    if (computed != null) {
      setMonthlyFee(computed)
      setDailyFeeDraft(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageStartDate, expectedEndDate])

  if (!target) return null

  // [정합성] 보관 시작일이 계약 종료일보다 미래가 될 수 없다 (당일 허용)
  const periodError = validateContractPeriod(storageStartDate, expectedEndDate)
  const days = storageDays(storageStartDate, expectedEndDate)
  // 보관일수가 확정됐을 때만 monthlyFee 에서 파생해 보여주고, 미확정이면 임시 입력값을 그대로 보여준다.
  const dailyFee = days == null ? dailyFeeDraft : calcDailyFee(monthlyFee, storageStartDate, expectedEndDate)
  // 하루 보관료 칸에 직접 입력하면 그 순간 보관료 = 입력값 × 보관일수로 채운다(반대 방향은
  // 위 dailyFee 파생값이 이미 실시간으로 보여준다 — 등록 폼과 동일 패턴).
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
  const locationChanged = slotId !== currentSlotId
  const locationLabel = hint?.locationLabel
  // [예약 계약] 보관 시작일을 미래로 바꾸면 아직 실제 입고가 아니므로 자리를 물리적으로 옮길 수 없다
  //   (백엔드가 "입고일은 오늘 이후로 지정할 수 없습니다"로 막는다) — 위치 지정 UI를 숨기고 안내한다.
  const isFutureStart = storageStartDate !== '' && storageStartDate > today()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // [필수값 방어] 캘린더 선택기는 네이티브 input이 아니라 HTML5 required가 자동으로 걸리지 않는다
    if (!storageStartDate) return setFormError('보관 시작일을 입력하세요.')
    if (periodError) return setFormError(periodError)
    if (monthlyFee == null || monthlyFee <= 0) return setFormError('보관료를 입력하세요.')

    // 미정이면 종료일을 보내지 않는다 → 백엔드가 종료일을 비운 상태로 저장한다
    const endDateToSend = endDateUnknown ? undefined : expectedEndDate || undefined

    setFormError(null)
    setSubmitting(true)
    try {
      // ===== 1) 계약 원장 갱신 (핵심 트랜잭션) =====
      await orderApi.update(target!.id, {
        storageStartDate: storageStartDate || undefined,
        expectedEndDate: endDateToSend,
        monthlyFee: monthlyFee!,
        capacityTons: capacityTons ?? undefined,
        paymentType,
        paymentMethod,
        settlementUserId: paymentMethod === 'BANK_TRANSFER' ? (settlementUserId ?? undefined) : undefined,
        dueDate: dueDate || undefined,
        memo: memo || undefined,
        autoBillingEnabled,
        billingCycleMonths,
      })

      // ===== 2) 위치 변경 반영 (이동 / 신규 배정 / 미지정 해제) =====
      //   계약 저장은 이미 성공했으므로 여기서 실패해도 되돌리지 않고 알리기만 한다.
      //   위치는 계약 원장과 독립적인 부가 정보이며 격자에서 다시 옮길 수 있다.
      if (locationChanged) {
        try {
          if (currentSlotId != null && slotId != null && container != null) {
            await containerApi.move({ containerId: container.id, targetSlotId: slotId })
          } else if (currentSlotId == null && slotId != null) {
            await placeContainerAtSlot(target!.id, target!.warehouseId, slotId, {
              customerName: target!.customerName,
              inboundDate: storageStartDate || undefined,
              outboundDate: endDateToSend,
            })
          } else if (currentSlotId != null && slotId == null && container != null) {
            await containerApi.outbound({ containerId: container.id })
          }
        } catch (e) {
          window.alert(`계약은 저장됐지만 위치 변경에 실패했습니다.\n(${errMsg(e, '원인 미상')})`)
        }
      }

      // ===== 3) 컨테이너 표시 정보 동기화 =====
      //   격자 뷰는 컨테이너의 날짜·용량도 함께 보여준다. 계약만 고치고 두면 같은 값이
      //   화면마다 다르게 보이므로, 연결된 컨테이너가 있으면 같은 값으로 맞춰준다.
      if (container) {
        try {
          await containerApi.update(container.id, {
            containerNo: container.containerNo, // 백엔드 필수값 — 기존 번호를 그대로 실어 보낸다
            capacityTon: capacityTons != null ? Math.round(capacityTons) : undefined,
            inboundDate: storageStartDate || undefined,
            expectedOutboundDate: endDateToSend,
          })
        } catch {
          // 표시용 동기화 실패는 계약 수정의 성패를 좌우하지 않는다(조회 시 계약 값이 우선 표시됨)
        }
      }

      // [자가 치유 동기화] 계약 목록·격자 뷰·대시보드가 이 신호를 구독해 스스로 다시 읽는다.
      orderSync.emit()
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '계약 수정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="계약 수정"
      widthClass="max-w-5xl"
      footer={
        <FormActions
          formId={FORM_ID}
          onCancel={onClose}
          submitting={submitting}
          disabled={periodError != null}
          submitLabel="수정 완료"
          submittingLabel="저장 중…"
        />
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {/* 고객·창고·자리는 계약의 정체성이라 수정 대상이 아니다 — 맥락으로만 고정 노출 */}
        <ContextBar
          items={[
            { label: '고객', value: target.customerName },
            { label: '창고', value: locationLabel ? `${target.warehouseName} · ${locationLabel}` : target.warehouseName },
          ]}
        />

        {/* 위치 — 등록 화면과 같은 자리(폼 상단)에 둔다 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={cn(labelCls, 'mb-0')}>컨테이너 위치 지정</label>
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
          {isFutureStart ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-sm text-slate-500">
              보관 시작일이 아직 오지 않은 예약 계약입니다. 입고일이 되면 컨테이너 관리 화면에서 자리를 배정해주세요.
            </p>
          ) : (
            <LocationPickerField
              warehouseId={target.warehouseId}
              value={slotId}
              onChange={setSlotId}
              currentSlotId={currentSlotId}
            />
          )}
        </div>

        <FieldGrid>
          <GridField label="보관 시작일" required>
            <CalendarField
              value={storageStartDate}
              onChange={setStartDate}
              className={cn(gridInputCls, periodError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
            />
          </GridField>

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
              className={cn(
                gridInputCls,
                'pr-8',
                monthlyFee != null && monthlyFee > 0 && 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100',
              )}
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

          <GridField label="보관일수" hint="보관 시작일 ~ 출고 예정일 (당일 포함)">
            <div className={gridReadonlyCls}>{days != null ? `${days.toLocaleString()}일` : ''}</div>
          </GridField>

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
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as OrderPaymentMethod)}
              className={gridInputCls}
            >
              <option value="BANK_TRANSFER">계좌이체</option>
              <option value="CASH">현금</option>
              <option value="CARD">카드</option>
            </select>
          </GridField>

          {/*
            컨테이너 번호(시스템 채번값)는 화면에 노출하지 않는다.
            현장에서 쓰는 식별자는 '화주명 + 자리(3층-7)'이고, 내부 채번 번호는 담당자가
            판단에 쓰지 않는 값이라 항목만 늘려 폼을 무겁게 만든다.
            저장 시에는 백엔드 필수값이므로 container 상태에서 그대로 실어 보낸다.
          */}
        </FieldGrid>
        {/* 짝이 없는 단독 필드라 2열 그리드에 반쪽으로 남기지 않고 전체 폭으로 — 다른 단독 필드(메모 등)와 통일 */}
        <Field label="납기일">
          <CalendarField value={dueDate} onChange={setDueDate} className={inputCls} />
        </Field>

        {/* [계좌 연동] 계좌이체일 때만 입금 계좌(담당 직원) 지정 폼 노출 */}
        {paymentMethod === 'BANK_TRANSFER' && (
          <PaymentAccountPicker staffList={staffList} value={settlementUserId} onChange={setSettlementUserId} />
        )}

        <AutoBillingToggle
          checked={autoBillingEnabled}
          onChange={setAutoBillingEnabled}
          dueDate={dueDate}
          cycleMonths={billingCycleMonths}
          onCycleMonthsChange={setBillingCycleMonths}
        />

        <Field label="메모">
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
            placeholder="계약 특이사항이나 부대 정보를 자유롭게 입력하세요."
            className={cn(inputCls, 'min-h-[64px] w-full resize-y leading-relaxed')}
          />
        </Field>

        {formError && <p className="text-sm text-red-600">{formError}</p>}
      </form>
    </Modal>
  )
}
