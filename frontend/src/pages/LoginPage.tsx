import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { Boxes, ShieldCheck, Layers, Activity } from 'lucide-react'
import { authApi } from '@/api/authApi'
import { authStorage } from '@/lib/auth'
import FindAccountModal from '@/components/auth/FindAccountModal'
import WarehouseArt from '@/components/brand/WarehouseArt'

export default function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // 요청 필드명은 username을 유지하되 값에는 이메일을 담아 전송(백엔드가 이메일로 조회)
      const res = await authApi.login({ username: email, password })
      // [자동 로그인] 체크 시 localStorage(영속), 미체크 시 sessionStorage(브라우저 종료 시 만료)
      authStorage.setToken(res.accessToken, rememberMe)
      authStorage.setUser(
        {
          userId: res.userId,
          username: res.username,
          name: res.name,
          role: res.role,
          tenantId: res.tenantId!,
        },
        rememberMe,
      )
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
    <div className="flex min-h-screen bg-slate-100">
      {/* ===== 좌측 브랜드 히어로 (데스크톱) ===== */}
      <aside className="bg-brand-hero relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex xl:w-[55%]">
        <div className="bg-node-dots absolute inset-0 opacity-60" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 backdrop-blur">
            <Boxes size={20} />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">창고관리시스템</p>
            <p className="text-xs text-slate-300">Smart Yard &amp; Warehouse</p>
          </div>
        </div>

        <div className="relative">
          <WarehouseArt className="mb-8 w-full max-w-xl" />
          <h2 className="text-3xl font-bold leading-snug text-white">
            컨테이너 보관창고를
            <br />
            한 화면에서 스마트하게
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-300">
            입출고·보관 계약·청구 정산·보관창고 배치까지, 현장 운영에 필요한 모든 흐름을 실시간으로 관리하세요.
          </p>

          <div className="mt-8 flex flex-wrap gap-2.5">
            <HeroChip icon={<Layers size={14} />} label="보관창고 3단 적재 관리" />
            <HeroChip icon={<Activity size={14} />} label="실시간 입출고 현황" />
            <HeroChip icon={<ShieldCheck size={14} />} label="금융 원장 수준 정산" />
          </div>
        </div>

        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()} 인테리어/이사보관 창고관리시스템 · 문의 : 010 - 6484 - 2434</p>
      </aside>

      {/* ===== 우측 로그인 폼 ===== */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-soft ring-1 ring-slate-200/60">
          {/* 모바일 브랜드 */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-sm">
              <Boxes size={20} />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-800">창고관리시스템</p>
              <p className="text-xs text-slate-400">Smart Yard &amp; Warehouse</p>
            </div>
          </div>

          <h1 className="text-xl font-bold text-slate-800">로그인</h1>
          <p className="mt-1 text-sm text-slate-500">계정 정보를 입력해 주세요.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              required
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              inputMode="email"
              placeholder="example@company.com"
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
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {/* 자동 로그인: 체크 시에만 브라우저를 닫아도 세션 유지 */}
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            자동 로그인
          </label>

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

        {/* 비밀번호 재설정 (아이디=이메일이므로 '아이디 찾기'는 불필요) */}
        <div className="mt-4 flex items-center justify-center text-xs text-slate-500">
          <button type="button" onClick={() => setRecoveryOpen(true)} className="hover:text-violet-600">
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
      </main>

      <FindAccountModal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
    </div>
  )
}

/* 히어로 특징 칩 */
function HeroChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 backdrop-blur">
      <span className="text-indigo-200">{icon}</span>
      {label}
    </span>
  )
}
