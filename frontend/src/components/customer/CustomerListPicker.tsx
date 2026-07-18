import { useMemo, useState } from 'react'
import { Search, Check, Building2, UserRound, Plus } from 'lucide-react'
import type { Customer } from '@/api/customerApi'
import { digitsOnly } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * 오른쪽 패널형 화주(고객) 검색 리스트 — 계약 등록·즉시 입고 팝업에서 공용 사용.
 * - 이름/연락처 즉시 필터(검색어 없으면 전체 = 최근 등록순)
 * - 항목 클릭으로 선택, 선택 항목 하이라이트 + 체크
 * - onQuickAdd 가 있으면 헤더에 '새 고객' 버튼 노출
 */
export default function CustomerListPicker({
  customers,
  selectedId,
  onSelect,
  onQuickAdd,
  className,
}: {
  customers: Customer[]
  selectedId: number | null
  onSelect: (c: Customer) => void
  onQuickAdd?: () => void
  className?: string
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qd = digitsOnly(query)
    if (!q) return customers
    return customers.filter((c) => {
      const byName = c.name.toLowerCase().includes(q)
      const byPhone = qd.length > 0 && (c.phoneNumber ?? '').replace(/\D/g, '').includes(qd)
      return byName || byPhone
    })
  }, [customers, query])

  return (
    <div className={cn('flex max-h-[24rem] flex-col overflow-hidden rounded-xl border border-slate-200', className)}>
      <div className="flex items-center gap-2 border-b border-slate-200 p-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·연락처로 검색"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white"
          />
        </div>
        {onQuickAdd && (
          <button
            type="button"
            onClick={onQuickAdd}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <Plus size={13} /> 새 고객
          </button>
        )}
      </div>

      <div className="px-3 py-1.5 text-[11px] text-slate-400">
        {query.trim() ? `검색 결과 ${filtered.length}건` : `전체 ${customers.length}명`}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-slate-400">일치하는 고객이 없습니다.</li>
        ) : (
          filtered.map((c) => {
            const active = c.id === selectedId
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left transition',
                    active ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      c.customerType === 'CORPORATE' ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {c.customerType === 'CORPORATE' ? <Building2 size={14} /> : <UserRound size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{c.name}</span>
                    <span className="block truncate text-xs text-slate-400">{c.phoneNumber || '연락처 없음'}</span>
                  </span>
                  {active && <Check size={16} className="shrink-0 text-indigo-600" />}
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
