import type { Staff } from '@/api/staffApi'
import { inputCls, labelCls } from './orderFormUi'

/**
 * [계좌 연동] 결제 수단이 '계좌이체'일 때 입금받을 담당 직원(=수납 계좌)을 지정한다.
 * 계약 등록·수정 팝업이 공유한다.
 */
export default function PaymentAccountPicker({
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
      <label className={labelCls}>입금 계좌 (담당 직원)</label>
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
