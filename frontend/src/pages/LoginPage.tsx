import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { authApi } from '@/api/authApi'
import { authStorage } from '@/lib/auth'
import FindAccountModal from '@/components/auth/FindAccountModal'

export default function LoginPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recovery, setRecovery] = useState<null | 'username' | 'password'>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authApi.login({ username, password })
      authStorage.setToken(res.accessToken)
      authStorage.setUser({
        userId: res.userId,
        username: res.username,
        name: res.name,
        role: res.role,
        tenantId: res.tenantId,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      const message = isAxiosError(err)
        ? (err.response?.data?.message ?? '로그인에 실패했습니다.')
        : '서버에 연결할 수 없습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">WMS 로그인</h1>
        <p className="mt-1 text-sm text-slate-500">창고 관리 시스템</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white transition hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? '로그인 중…' : '로그인'}
          </button>
        </form>

        {/* 계정 찾기 */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          <button type="button" onClick={() => setRecovery('username')} className="hover:text-violet-600">
            아이디 찾기
          </button>
          <span className="text-slate-300">|</span>
          <button type="button" onClick={() => setRecovery('password')} className="hover:text-violet-600">
            비밀번호 재설정
          </button>
        </div>

        {/* 회원가입 유도 */}
        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
          아직 회원이 아니신가요?{' '}
          <Link to="/signup" className="font-semibold text-violet-600 hover:text-violet-700">
            회원가입
          </Link>
        </div>
      </div>

      <FindAccountModal
        open={recovery !== null}
        initialTab={recovery ?? 'username'}
        onClose={() => setRecovery(null)}
      />
    </div>
  )
}
