import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X, Search, Building2, User as UserIcon, Clock } from 'lucide-react'
import type { CustomerDto } from '@/api/customerApi'
import { digitsOnly } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * 고객 검색기 모달 (방식 B).
 * - 이름/연락처/사업자번호로 정밀 검색
 * - 검색어가 없으면 '최근 등록 고객'을 기본 노출
 * - 방향키(↑/↓) 이동 + Enter 선택 (접근성)
 */
export default function CustomerSearchModal({
  open,
  customers,
  onClose,
  onSelect,
}: {
  open: boolean
  customers: CustomerDto[]
  onClose: () => void
  onSelect: (c: CustomerDto) => void
}) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
    }
  }, [open])

  const isSearching = query.trim().length > 0

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const qDigits = digitsOnly(query)
    if (q === '') return customers.slice(0, 20) // 최근(목록 상단 = 최신 등록)
    return customers.filter((c) => {
      const byName = c.name.toLowerCase().includes(q)
      const byPhone = qDigits.length > 0 && (c.phoneNumber ?? '').replace(/\D/g, '').includes(qDigits)
      const byBiz = qDigits.length > 0 && (c.businessNumber ?? '').replace(/\D/g, '').includes(qDigits)
      return byName || byPhone || byBiz
    })
  }, [customers, query])

  useEffect(() => setHighlight(0), [query])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const picked = results[highlight]
      if (picked) onSelect(picked)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  // 하이라이트 항목이 보이도록 스크롤
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-20">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* 검색 헤더 */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Search size={18} className="text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="이름 · 연락처 · 사업자번호로 검색"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 text-xs text-slate-400">
          {!isSearching && <Clock size={13} />}
          {isSearching ? `검색 결과 ${results.length}건` : '최근 등록 고객'}
          <span className="ml-auto hidden items-center gap-1 sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> 이동 · <Kbd>Enter</Kbd> 선택
          </span>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-400">일치하는 고객이 없습니다.</p>
        ) : (
          <ul ref={listRef} className="max-h-80 overflow-y-auto pb-2">
            {results.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => onSelect(c)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left transition',
                    i === highlight ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      c.customerType === 'CORPORATE' ? 'bg-violet-50 text-violet-600' : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {c.customerType === 'CORPORATE' ? <Building2 size={15} /> : <UserIcon size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{c.name}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {c.phoneNumber || '연락처 없음'}
                      {c.businessNumber ? ` · ${c.businessNumber}` : ''}
                    </span>
                  </span>
                  {i === highlight && <span className="text-xs font-medium text-indigo-500">Enter ↵</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
      {children}
    </kbd>
  )
}
