import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { X, UserSearch, KeyRound, CheckCircle2, Loader2, MailCheck } from 'lucide-react'
import { recoveryApi } from '@/api/recoveryApi'
import { cn } from '@/lib/cn'

type Tab = 'username' | 'password'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100'

export default function FindAccountModal({
  open,
  initialTab = 'username',
  onClose,
}: {
  open: boolean
  initialTab?: Tab
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">계정 찾기</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* 탭 */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <TabButton active={tab === 'username'} onClick={() => setTab('username')} icon={<UserSearch size={15} />}>
            아이디 찾기
          </TabButton>
          <TabButton active={tab === 'password'} onClick={() => setTab('password')} icon={<KeyRound size={15} />}>
            비밀번호 재설정
          </TabButton>
        </div>

        {tab === 'username' ? <FindUsernamePanel /> : <ResetRequestPanel />}
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition',
        active ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/* ===== 아이디 찾기 ===== */
function FindUsernamePanel() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ found: boolean; masked: string | null; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      const r = await recoveryApi.findUsername(name, email)
      setResult({ found: r.found, masked: r.maskedUsername, message: r.message })
    } catch (err) {
      setError(isAxiosError(err) ? (err.response?.data?.message ?? '조회에 실패했습니다.') : '조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-slate-500">가입 시 등록한 이름과 이메일을 입력하세요.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="이름" className={inputCls} />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value.trim())}
        required
        placeholder="이메일"
        className={inputCls}
      />

      {result && (
        <div
          className={cn(
            'rounded-lg px-3 py-3 text-sm',
            result.found ? 'bg-violet-50 text-violet-800' : 'bg-slate-50 text-slate-500',
          )}
        >
          {result.found && result.masked ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-violet-600" />
              회원님의 아이디는 <span className="font-bold tracking-wide">{result.masked}</span> 입니다.
            </span>
          ) : (
            result.message
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        아이디 찾기
      </button>
    </form>
  )
}

/* ===== 비밀번호 재설정 요청 ===== */
function ResetRequestPanel() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const msg = await recoveryApi.requestPasswordReset(username, email)
      setSent(msg)
    } catch (err) {
      setError(isAxiosError(err) ? (err.response?.data?.message ?? '요청에 실패했습니다.') : '요청에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-600">
          <MailCheck size={22} />
        </div>
        <p className="text-sm text-slate-700">{sent}</p>
        <p className="text-xs text-slate-400">메일의 링크는 15분간 유효합니다. 받은 편지함(스팸함 포함)을 확인하세요.</p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-slate-500">아이디와 가입 이메일을 입력하면 재설정 링크를 보내드립니다.</p>
      <input value={username} onChange={(e) => setUsername(e.target.value.trim())} required placeholder="아이디" className={inputCls} />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value.trim())}
        required
        placeholder="이메일"
        className={inputCls}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        재설정 링크 받기
      </button>
    </form>
  )
}
