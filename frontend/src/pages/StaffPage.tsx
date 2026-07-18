import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Plus, Loader2, ShieldCheck, User as UserIcon, Users } from 'lucide-react'
import { staffApi, type Staff, type StaffCreate } from '@/api/staffApi'
import type { UserRole } from '@/lib/auth'
import { authStorage } from '@/lib/auth'
import { validateUsername, validatePassword, USERNAME_REGEX, PASSWORD_REGEX } from '@/hooks/useFormValidation'
import { cn } from '@/lib/cn'
import Modal from '@/components/ui/Modal'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

/* [뮤티드 상태색] 채도를 눌러 익힌 톤 — 경고조차 품위 있게 (마스터플랜 2.1) */
const STATUS_META: Record<Staff['status'], { label: string; cls: string }> = {
  ACTIVE: { label: '활성', cls: 'bg-[#E9EFEA] text-[#5C7C6B] ring-[#D3DFD6]' },
  PENDING: { label: '대기', cls: 'bg-[#EFEBE4] text-[#8A8172] ring-[#E2DCD1]' },
  INACTIVE: { label: '비활성', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

export default function StaffPage() {
  const me = authStorage.getUser()
  const isAdmin = me?.role === 'ADMIN'

  const [items, setItems] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    staffApi
      .list()
      .then(setItems)
      .catch(() => setError('직원 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [isAdmin, refreshKey])

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
          <ShieldCheck size={28} className="text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-700">관리자 전용 화면입니다</p>
          <p className="mt-1 text-sm text-slate-400">직원 계정 관리는 관리자(ADMIN)만 접근할 수 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">직원 관리</h2>
          <p className="mt-1 text-sm text-slate-500">우리 업체 소속 계정을 추가·관리합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
        >
          <Plus size={16} />
          직원 추가
        </button>
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

      {!loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-10 py-16 text-center">
          <Users size={26} className="text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-700">등록된 계정이 없습니다</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">이름</th>
                <th className="px-5 py-3 font-medium">아이디</th>
                <th className="px-5 py-3 font-medium">권한</th>
                <th className="px-5 py-3 font-medium">상태</th>
                <th className="px-5 py-3 font-medium">가입일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((s) => (
                <tr key={s.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    <span className="flex items-center gap-2">
                      {s.role === 'ADMIN' ? (
                        <ShieldCheck size={15} className="text-indigo-500" />
                      ) : (
                        <UserIcon size={15} className="text-slate-400" />
                      )}
                      {s.name}
                      {s.id === me?.userId && <span className="text-xs text-slate-400">(나)</span>}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{s.username}</td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                        s.role === 'ADMIN'
                          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                          : 'bg-slate-100 text-slate-600 ring-slate-200',
                      )}
                    >
                      {s.role === 'ADMIN' ? '관리자' : '직원'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                        STATUS_META[s.status].cls,
                      )}
                    >
                      {STATUS_META[s.status].label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{s.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateStaffModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onDone={() => {
          setCreateOpen(false)
          setRefreshKey((k) => k + 1)
        }}
      />
    </div>
  )
}

/* ===== 직원 추가 ===== */
function CreateStaffModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('STAFF')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setUsername('')
      setPassword('')
      setName('')
      setRole('STAFF')
      setFormError(null)
    }
  }, [open])

  const usernameError = validateUsername(username)
  const passwordError = validatePassword(password)
  const canSubmit =
    USERNAME_REGEX.test(username) && PASSWORD_REGEX.test(password) && name.trim().length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setFormError(null)
    setSubmitting(true)
    const body: StaffCreate = { username, password, name, role }
    try {
      await staffApi.create(body)
      onDone()
    } catch (err) {
      setFormError(isAxiosError(err) ? (err.response?.data?.message ?? '직원 추가에 실패했습니다.') : '직원 추가에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="직원 계정 추가">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">아이디 *</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            placeholder="영문 소문자·숫자 4~20자"
            className={cn(inputCls, usernameError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
          />
          {usernameError && <p className="mt-1 text-xs text-red-600">{usernameError}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">비밀번호 *</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="영문·숫자·특수문자 조합 8~20자"
            className={cn(inputCls, passwordError && 'border-red-400 focus:border-red-500 focus:ring-red-100')}
          />
          {passwordError && <p className="mt-1 text-xs text-red-600">{passwordError}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">이름 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">권한</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputCls}>
              <option value="STAFF">직원</option>
              <option value="ADMIN">관리자</option>
            </select>
          </div>
        </div>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          소속 업체는 로그인한 관리자 계정에서 자동 상속됩니다. 아이디는 전 시스템에서 중복될 수 없습니다.
        </p>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50">
            취소
          </button>
          <button type="submit" disabled={submitting || !canSubmit} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
            {submitting ? '추가 중…' : '추가'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
