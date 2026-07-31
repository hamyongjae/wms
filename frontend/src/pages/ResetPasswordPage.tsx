import { useState, type FormEvent } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { Boxes, Eye, EyeOff, Check, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { recoveryApi } from '@/api/recoveryApi'
import { validatePassword, PASSWORD_REGEX } from '@/hooks/useFormValidation'
import { cn } from '@/lib/cn'

const inputBase =
  'w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400'
const inputOk = 'border-slate-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-100'
const inputErr = 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const passwordError = validatePassword(password)
  const confirmError = confirm.length > 0 && confirm !== password ? '비밀번호가 일치하지 않습니다.' : null
  const confirmValid = confirm.length > 0 && confirm === password && PASSWORD_REGEX.test(password)
  const canSubmit = PASSWORD_REGEX.test(password) && confirmValid && token.length > 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setServerError(null)
    setSubmitting(true)
    try {
      await recoveryApi.confirmPasswordReset(token, password)
      setDone(true)
    } catch (err) {
      setServerError(
        isAxiosError(err) ? (err.response?.data?.message ?? '재설정에 실패했습니다.') : '서버에 연결할 수 없습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-app-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Boxes size={22} />
          </span>
          <span className="text-lg font-bold text-slate-800">비밀번호 재설정</span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60 sm:p-8">
          {!token ? (
            <div className="text-center">
              <AlertCircle size={26} className="mx-auto text-amber-500" />
              <p className="mt-3 text-sm font-medium text-slate-700">유효하지 않은 접근입니다</p>
              <p className="mt-1 text-xs text-slate-400">이메일로 받은 재설정 링크로 다시 접속해 주세요.</p>
              <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-violet-600 hover:text-violet-700">
                로그인으로
              </Link>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={24} />
              </div>
              <p className="mt-3 text-sm font-medium text-slate-800">비밀번호가 변경되었습니다</p>
              <p className="mt-1 text-xs text-slate-400">새 비밀번호로 로그인해 주세요.</p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                로그인하러 가기
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">새 비밀번호</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="영문·숫자·특수문자 조합 8~20자"
                    className={cn(inputBase, 'pr-10', passwordError ? inputErr : inputOk)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordError && <p className="mt-1 text-xs text-red-600">{passwordError}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">새 비밀번호 확인</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className={cn(
                      inputBase,
                      'pr-10',
                      confirmError ? inputErr : confirmValid ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-100' : inputOk,
                    )}
                  />
                  {confirmValid && <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />}
                </div>
                {confirmError && <p className="mt-1 text-xs text-red-600">{confirmError}</p>}
              </div>

              {serverError && (
                <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !canSubmit}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {submitting && <Loader2 size={15} className="animate-spin" />}
                비밀번호 변경
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
