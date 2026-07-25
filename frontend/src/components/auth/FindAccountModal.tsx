import { useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { X, KeyRound, Loader2, MailCheck } from 'lucide-react'
import { recoveryApi } from '@/api/recoveryApi'
import { cn } from '@/lib/cn'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100'

/**
 * [이메일 ID] 계정 아이디가 이메일이므로 '아이디 찾기'는 불필요.
 * 이메일만으로 비밀번호 재설정 링크를 발송한다.
 */
export default function FindAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <KeyRound size={17} className="text-violet-600" />
            비밀번호 재설정
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <ResetRequestPanel />
      </div>
    </div>
  )
}

/* ===== 비밀번호 재설정 요청 (이메일만) ===== */
function ResetRequestPanel() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const msg = await recoveryApi.requestPasswordReset(email)
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
      <p className="text-xs text-slate-500">가입한 이메일 주소를 입력하면 재설정 링크를 보내드립니다.</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value.trim())}
        required
        autoFocus
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="example@company.com"
        className={inputCls}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60',
        )}
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        재설정 링크 받기
      </button>
    </form>
  )
}
