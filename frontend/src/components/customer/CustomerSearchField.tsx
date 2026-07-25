import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Search, Building2, User as UserIcon, UserPlus, Check } from 'lucide-react'
import type { CustomerDto } from '@/api/customerApi'
import CustomerSearchModal from '@/components/customer/CustomerSearchModal'
import { cn } from '@/lib/cn'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

/**
 * 하이브리드 고객 검색기.
 * - 방식 A: 타이핑 시 인라인 자동완성 드롭다운(↑/↓/Enter 지원)
 * - 방식 B: 우측 돋보기 → 넓은 검색 모달
 * 선택된 고객은 value(CustomerDto)로 상위 폼에 바인딩된다.
 */
export default function CustomerSearchField({
  customers,
  value,
  onChange,
  onQuickAdd,
}: {
  customers: CustomerDto[]
  value: CustomerDto | null
  onChange: (c: CustomerDto | null) => void
  onQuickAdd?: () => void
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)

  // 외부에서 value가 바뀌면(모달 선택/초기화) 입력 텍스트 동기화
  useEffect(() => {
    setQuery(value?.name ?? '')
  }, [value])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q === '' ? customers : customers.filter((c) => c.name.toLowerCase().includes(q))
    return list.slice(0, 8)
  }, [customers, query])

  useEffect(() => setHighlight(0), [query])

  function select(c: CustomerDto) {
    onChange(c)
    setQuery(c.name)
    setOpen(false)
  }

  function onInputChange(v: string) {
    setQuery(v)
    setOpen(true)
    // 타이핑으로 이름이 바뀌면 기존 선택 해제(폼 상태를 실제와 일치시킴)
    if (value && v !== value.name) onChange(null)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && matches[highlight]) {
        e.preventDefault()
        select(matches[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={onKeyDown}
            placeholder="고객명으로 검색 (예: 대원)"
            className={inputCls}
            autoComplete="off"
          />
          {value && (
            <Check size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
          )}

          {/* 인라인 자동완성 드롭다운 */}
          {open && matches.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {matches.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    // onMouseDown: input의 blur보다 먼저 실행되어 선택이 닫힘에 씹히지 않도록
                    onMouseDown={(e) => {
                      e.preventDefault()
                      select(c)
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left transition',
                      i === highlight ? 'bg-indigo-50' : 'hover:bg-slate-50',
                    )}
                  >
                    {c.customerType === 'CORPORATE' ? (
                      <Building2 size={14} className="shrink-0 text-violet-500" />
                    ) : (
                      <UserIcon size={14} className="shrink-0 text-slate-400" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-800">{c.name}</span>
                      {c.phoneNumber && <span className="block truncate text-xs text-slate-400">{c.phoneNumber}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 방식 B: 검색 모달 열기 */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          title="고객 검색기 열기"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
        >
          <Search size={16} />
        </button>

        {onQuickAdd && (
          <button
            type="button"
            onClick={onQuickAdd}
            title="새 고객 등록"
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600 transition hover:bg-indigo-100"
          >
            <UserPlus size={16} />
          </button>
        )}
      </div>

      <CustomerSearchModal
        open={modalOpen}
        customers={customers}
        onClose={() => setModalOpen(false)}
        onSelect={(c) => {
          select(c)
          setModalOpen(false)
        }}
      />
    </div>
  )
}
