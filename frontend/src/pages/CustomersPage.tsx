import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Plus, Pencil, Trash2, Loader2, Users, Search, Building2, User as UserIcon, ShieldAlert } from 'lucide-react'
import {
  customerApi,
  type Customer,
  type CustomerType,
  type CustomerStatus,
  type CustomerUpsert,
} from '@/api/customerApi'
import { authStorage } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { formatBusinessNumber } from '@/lib/format'
import Modal from '@/components/ui/Modal'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

/* [뮤티드 상태색] 채도를 눌러 익힌 톤 — 경고조차 품위 있게 (마스터플랜 2.1) */
const STATUS_META: Record<CustomerStatus, { label: string; cls: string }> = {
  ACTIVE: { label: '이용중', cls: 'bg-[#E9EFEA] text-[#5C7C6B] ring-[#D3DFD6]' },
  DORMANT: { label: '휴면', cls: 'bg-[#EFEBE4] text-[#8A8172] ring-[#E2DCD1]' },
  BLACKLISTED: { label: '블랙리스트', cls: 'bg-[#F2E8E3] text-[#A65B44] ring-[#E4D2C9]' },
}

const STATUS_OPTIONS: CustomerStatus[] = ['ACTIVE', 'DORMANT', 'BLACKLISTED']

type FilterKey = 'ALL' | CustomerStatus
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'ACTIVE', label: '이용중' },
  { key: 'DORMANT', label: '휴면' },
  { key: 'BLACKLISTED', label: '블랙리스트' },
]

export default function CustomersPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [items, setItems] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('ALL')
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [blacklistTarget, setBlacklistTarget] = useState<Customer | null>(null)

  const reload = () => setRefreshKey((k) => k + 1)

  useEffect(() => {
    setLoading(true)
    setError(null)
    customerApi
      .list()
      .then(setItems)
      .catch(() => setError('고객 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [refreshKey])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((c) => {
      const okStatus = filter === 'ALL' || c.status === filter
      const okQuery =
        q === '' ||
        c.name.toLowerCase().includes(q) ||
        (c.phoneNumber ?? '').includes(q)
      return okStatus && okQuery
    })
  }, [items, query, filter])

  async function handleStatus(c: Customer, status: CustomerStatus) {
    // 블랙리스트 지정은 사유가 필수 → 사유 입력 모달을 먼저 띄운다
    if (status === 'BLACKLISTED') {
      setBlacklistTarget(c)
      return
    }
    try {
      await customerApi.changeStatus(c.id, { status })
      reload()
    } catch (err) {
      alert(errMsg(err, '상태 변경에 실패했습니다.'))
    }
  }

  async function handleDelete(c: Customer) {
    if (!window.confirm(`'${c.name}' 고객을 삭제할까요? (계약이 있으면 실패할 수 있습니다)`)) return
    try {
      await customerApi.remove(c.id)
      reload()
    } catch (err) {
      alert(errMsg(err, '삭제에 실패했습니다.'))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">고객 관리</h2>
          <p className="mt-1 text-sm text-slate-500">보관 계약 고객(개인·기업)을 등록하고 상태를 관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus size={16} />
          고객 등록
        </button>
      </div>

      {/* 검색 + 필터 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름·연락처 검색"
            className={cn(inputCls, 'pl-9')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const count = f.key === 'ALL' ? items.length : items.filter((c) => c.status === f.key).length
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
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="animate-spin" size={18} />
          <span className="text-sm">불러오는 중…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <Users size={22} />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-700">
            {items.length === 0 ? '등록된 고객이 없습니다' : '조건에 맞는 고객이 없습니다'}
          </p>
          <p className="mt-1 text-sm text-slate-400">"고객 등록"으로 첫 고객을 추가하세요.</p>
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="px-4 py-3 font-medium">고객명</th>
                <th className="px-3 py-3 font-medium">유형</th>
                <th className="px-3 py-3 font-medium">연락처</th>
                <th className="px-4 py-3 font-medium">메모</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-3 py-3 text-right font-medium">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((c) => (
                <tr
                  key={c.id}
                  className={cn(
                    'transition',
                    c.status === 'BLACKLISTED' ? 'bg-red-50/60 hover:bg-red-50' : 'hover:bg-slate-50',
                  )}
                >
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <span className="flex items-center gap-1.5">
                      {c.status === 'BLACKLISTED' && <ShieldAlert size={15} className="text-red-500" />}
                      {c.name}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-500">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                      {c.customerType === 'CORPORATE' ? <Building2 size={14} /> : <UserIcon size={14} />}
                      {c.customerType === 'CORPORATE' ? '기업' : '개인'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-500">{c.phoneNumber || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    <span className="truncate text-xs" title={c.memo || ''}>
                      {c.memo || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={c.status}
                      onChange={(e) => handleStatus(c, e.target.value as CustomerStatus)}
                      title={c.status === 'BLACKLISTED' && c.blacklistReason ? `사유: ${c.blacklistReason}` : undefined}
                      className={cn(
                        'cursor-pointer rounded-full px-2 py-0.5 text-xs font-medium ring-1 outline-none',
                        STATUS_META[c.status].cls,
                      )}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_META[s].label}
                        </option>
                      ))}
                    </select>
                    {c.status === 'BLACKLISTED' && c.blacklistReason && (
                      <p className="mt-1 max-w-[180px] truncate text-[11px] text-red-500" title={c.blacklistReason}>
                        {c.blacklistReason}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditTarget(c)}
                        title="수정"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Pencil size={15} />
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          title="삭제"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerModal
        open={createOpen || editTarget != null}
        target={editTarget}
        onClose={() => {
          setCreateOpen(false)
          setEditTarget(null)
        }}
        onDone={() => {
          setCreateOpen(false)
          setEditTarget(null)
          reload()
        }}
      />

      <BlacklistReasonModal
        target={blacklistTarget}
        onClose={() => setBlacklistTarget(null)}
        onDone={() => {
          setBlacklistTarget(null)
          reload()
        }}
      />
    </div>
  )
}

/* ===== 블랙리스트 지정 사유 모달 ===== */
function BlacklistReasonModal({
  target,
  onClose,
  onDone,
}: {
  target: Customer | null
  onClose: () => void
  onDone: () => void
}) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (target) {
      setReason('')
      setFormError(null)
    }
  }, [target])

  if (!target) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (reason.trim().length === 0) return setFormError('지정 사유를 입력하세요.')
    setFormError(null)
    setSubmitting(true)
    try {
      await customerApi.changeStatus(target!.id, { status: 'BLACKLISTED', reason: reason.trim() })
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '블랙리스트 지정에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="블랙리스트 지정">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">{target.name}</span> 고객을 블랙리스트로 지정합니다. 이후 이 고객 명의로는 신규
            계약을 등록할 수 없습니다.
          </span>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">지정 사유 *</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
            placeholder="예: 3개월 이상 보관료 상습 체납"
            className={inputCls}
          />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
            {submitting ? '지정 중…' : '블랙리스트 지정'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ===== 등록/수정 모달 ===== */
function CustomerModal({
  open,
  target,
  onClose,
  onDone,
}: {
  open: boolean
  target: Customer | null
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [customerType, setType] = useState<CustomerType>('INDIVIDUAL')
  const [businessNumber, setBusinessNumber] = useState('')
  const [phoneNumber, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [memo, setMemo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(target?.name ?? '')
    setType(target?.customerType ?? 'INDIVIDUAL')
    setBusinessNumber(target?.businessNumber ?? '')
    setPhone(target?.phoneNumber ?? '')
    setEmail(target?.email ?? '')
    setMemo(target?.memo ?? '')
    setFormError(null)
  }, [open, target])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    const body: CustomerUpsert = {
      name,
      customerType,
      businessNumber: businessNumber || undefined,
      phoneNumber: phoneNumber || undefined,
      email: email || undefined,
      memo: memo || undefined,
    }
    try {
      if (target) await customerApi.update(target.id, body)
      else await customerApi.create(body)
      onDone()
    } catch (err) {
      setFormError(errMsg(err, '저장에 실패했습니다.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={target ? '고객 수정' : '고객 등록'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">고객명 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">유형</label>
            <select value={customerType} onChange={(e) => setType(e.target.value as CustomerType)} className={inputCls}>
              <option value="INDIVIDUAL">개인</option>
              <option value="CORPORATE">기업</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">사업자등록번호</label>
            <input
              value={businessNumber}
              onChange={(e) => setBusinessNumber(formatBusinessNumber(e.target.value))}
              inputMode="numeric"
              placeholder="000-00-00000"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">연락처</label>
            <input value={phoneNumber} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">이메일 (청구·알림용)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">특이사항 메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder="현장 작업자용 특이사항을 자유롭게 입력하세요."
              className={cn(inputCls, 'min-h-24 resize-y')}
            />
          </div>
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function errMsg(err: unknown, fallback: string): string {
  return isAxiosError(err) ? (err.response?.data?.message ?? fallback) : fallback
}
