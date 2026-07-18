import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  Boxes,
  User as UserIcon,
  Building2,
  Check,
  ChevronLeft,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react'
import {
  authApi,
  type RegisterCompanyRequestDto,
  type CompanyProfileDto,
} from '@/api/authApi'
import { authStorage } from '@/lib/auth'
import { formatBusinessNumber, formatPhone, isValidBusinessNumber } from '@/lib/format'
import { useCredentialValidation } from '@/hooks/useFormValidation'
import { cn } from '@/lib/cn'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputBase =
  'w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-400'
const inputOk = 'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100'
const inputErr = 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100'

export default function SignupPage({ isSocialSignup: isSocialProp }: { isSocialSignup?: boolean } = {}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // 소셜 미완성 회원은 Step 1(계정 생성)을 건너뛰고 Step 2(회사 등록)만 진행
  const isSocialSignup = isSocialProp ?? params.get('mode') === 'social'

  // 소셜 모드는 곧장 Step 2에서 시작
  const [step, setStep] = useState<1 | 2>(isSocialSignup ? 2 : 1)

  // ===== Step 1: 마스터(ADMIN) 계정 =====
  // 아이디/비밀번호/확인은 실시간 정규식 검증 훅으로 관리
  const cred = useCredentialValidation()
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [showPw, setShowPw] = useState(false)

  // ===== Step 2: 업체(Tenant) =====
  const [companyName, setCompanyName] = useState('')
  const [businessNumber, setBusinessNumber] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const [touched, setTouched] = useState(false)   // '다음/가입' 눌러 검증을 켠 뒤에만 에러 노출
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // 소셜 모드인데 토큰이 없으면(=소셜 로그인 없이 직접 진입) 안내
  const socialTokenMissing = isSocialSignup && !authStorage.getToken()

  // ---- Step 1 이름/이메일 검증 (아이디·비번은 cred 훅이 담당) ----
  const nameError = adminName.trim().length === 0 ? '이름을 입력하세요.' : undefined
  const emailError = email.length > 0 && !EMAIL_RE.test(email) ? '이메일 형식이 올바르지 않습니다.' : undefined
  // 가입 버튼 활성화 기준: 정규식 통과 + 이름 입력 + (이메일은 입력 시에만 형식 검사)
  const canProceedStep1 = cred.allValid && !nameError && !emailError

  const step2Errors = useMemo(() => {
    const e: Record<string, string> = {}
    if (companyName.trim().length === 0) e.companyName = '업체명을 입력하세요.'
    if (!isValidBusinessNumber(businessNumber)) e.businessNumber = '사업자번호 10자리를 입력하세요.'
    return e
  }, [companyName, businessNumber])

  function goNext() {
    setTouched(true)
    if (!canProceedStep1) return
    setTouched(false)
    setServerError(null)
    setStep(2)
  }

  function goBack() {
    setServerError(null)
    setTouched(false)
    setStep(1)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (Object.keys(step2Errors).length > 0) return
    setServerError(null)
    setSubmitting(true)
    try {
      const res = isSocialSignup
        ? await authApi.socialRegisterCompany(buildCompanyProfile())
        : await authApi.registerCompany(buildRegisterPayload())

      authStorage.setToken(res.accessToken)
      authStorage.setUser({
        userId: res.userId,
        username: res.username,
        name: res.name,
        role: res.role,
        tenantId: res.tenantId ?? 0,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(
        isAxiosError(err)
          ? (err.response?.data?.message ?? '가입에 실패했습니다. 입력값을 확인해 주세요.')
          : '서버에 연결할 수 없습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 백엔드 DTO로 매핑 (필드명 정확히 일치) ----
  function buildRegisterPayload(): RegisterCompanyRequestDto {
    return {
      adminUsername: cred.username,
      adminPassword: cred.password,
      adminName: adminName.trim(),
      ceoName: adminName.trim(),        // 마스터 계정 = 대표자
      companyName: companyName.trim(),
      businessNumber: formatBusinessNumber(businessNumber),
      phone: phone || undefined,
      email: email || undefined,
      address: address.trim() || undefined,
    }
  }

  function buildCompanyProfile(): CompanyProfileDto {
    return {
      companyName: companyName.trim(),
      businessNumber: formatBusinessNumber(businessNumber),
      phone: phone || undefined,
      address: address.trim() || undefined,
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md">
        {/* 브랜드 */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
            <Boxes size={22} />
          </span>
          <span className="text-lg font-bold text-slate-800">WMS 회원가입</span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60 sm:p-8">
          <StepIndicator step={step} isSocialSignup={isSocialSignup} />

          {socialTokenMissing ? (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              소셜 로그인 정보가 없습니다. 먼저 소셜 로그인을 진행한 뒤 회사 등록을 완료해 주세요.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {/* ===== Step 1 ===== */}
              {step === 1 && (
                <>
                  <Field label="아이디" error={cred.usernameError ?? undefined} required>
                    <input
                      value={cred.username}
                      onChange={(e) => cred.setUsername(e.target.value)}
                      placeholder="영문 소문자·숫자 4~20자"
                      autoFocus
                      className={cn(inputBase, cred.usernameError ? inputErr : inputOk)}
                    />
                  </Field>

                  <Field label="비밀번호" error={cred.passwordError ?? undefined} required>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={cred.password}
                        onChange={(e) => cred.setPassword(e.target.value)}
                        placeholder="영문·숫자·특수문자 조합 8~20자"
                        className={cn(inputBase, 'pr-10', cred.passwordError ? inputErr : inputOk)}
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
                  </Field>

                  <Field
                    label="비밀번호 확인"
                    error={cred.confirmError ?? undefined}
                    hint={cred.confirmValid ? '비밀번호가 일치합니다.' : undefined}
                    required
                  >
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={cred.confirm}
                        onChange={(e) => cred.setConfirm(e.target.value)}
                        placeholder="비밀번호 재입력"
                        className={cn(
                          inputBase,
                          'pr-10',
                          cred.confirmError ? inputErr : cred.confirmValid ? 'border-emerald-400 focus:ring-2 focus:ring-emerald-100' : inputOk,
                        )}
                      />
                      {cred.confirmValid && (
                        <Check size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                      )}
                    </div>
                  </Field>

                  <Field label="사장님 이름" error={touched ? nameError : undefined} required>
                    <input
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="예: 함용재"
                      className={cn(inputBase, touched && nameError ? inputErr : inputOk)}
                    />
                  </Field>

                  <Field label="이메일" error={emailError}>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value.trim())}
                      placeholder="example@company.com"
                      className={cn(inputBase, emailError ? inputErr : inputOk)}
                    />
                  </Field>

                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canProceedStep1}
                    className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    다음 단계
                  </button>
                </>
              )}

              {/* ===== Step 2 ===== */}
              {step === 2 && (
                <>
                  {isSocialSignup && (
                    <p className="rounded-xl bg-indigo-50 px-4 py-3 text-xs text-indigo-700">
                      소셜 인증이 완료됐습니다. 소속 창고업체 정보만 등록하면 가입이 끝나요.
                    </p>
                  )}

                  <Field label="창고업체명" error={touched ? step2Errors.companyName : undefined} required>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="예: 대원 로지스틱스"
                      autoFocus
                      className={cn(inputBase, touched && step2Errors.companyName ? inputErr : inputOk)}
                    />
                  </Field>

                  <Field label="사업자 등록번호" error={touched ? step2Errors.businessNumber : undefined} required>
                    <input
                      value={businessNumber}
                      onChange={(e) => setBusinessNumber(formatBusinessNumber(e.target.value))}
                      placeholder="123-45-67890"
                      inputMode="numeric"
                      className={cn(inputBase, touched && step2Errors.businessNumber ? inputErr : inputOk)}
                    />
                  </Field>

                  <Field label="창고 연락처">
                    <input
                      value={phone}
                      onChange={(e) => setPhone(formatPhone(e.target.value))}
                      placeholder="02-1234-5678"
                      inputMode="numeric"
                      className={cn(inputBase, inputOk)}
                    />
                  </Field>

                  <Field label="창고 주소">
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="예: 경기도 김포시 …"
                      className={cn(inputBase, inputOk)}
                    />
                  </Field>

                  <div className="flex gap-2 pt-2">
                    {!isSocialSignup && (
                      <button
                        type="button"
                        onClick={goBack}
                        className="flex items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        <ChevronLeft size={16} />
                        이전
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          가입 처리 중…
                        </>
                      ) : (
                        '가입 완료'
                      )}
                    </button>
                  </div>
                </>
              )}

              {serverError && (
                <p className="flex items-start gap-1.5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {serverError}
                </p>
              )}
            </form>
          )}
        </div>

        {/* 로그인으로 회귀 */}
        <p className="mt-6 text-center text-sm text-slate-500">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}

/* ===== 단계 표시기 ===== */
function StepIndicator({ step, isSocialSignup }: { step: 1 | 2; isSocialSignup: boolean }) {
  // 소셜 가입은 회사 등록 한 단계뿐
  if (isSocialSignup) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-indigo-600">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white">
          <Building2 size={15} />
        </span>
        회사 등록
      </div>
    )
  }

  const steps = [
    { no: 1, label: '계정 정보', icon: <UserIcon size={15} /> },
    { no: 2, label: '업체 정보', icon: <Building2 size={15} /> },
  ]
  return (
    <div className="flex items-center">
      {steps.map((s, i) => {
        const active = step === s.no
        const done = step > s.no
        return (
          <div key={s.no} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-white transition',
                  done ? 'bg-emerald-500' : active ? 'bg-indigo-600' : 'bg-slate-300',
                )}
              >
                {done ? <Check size={15} /> : s.icon}
              </span>
              <span className={cn('text-sm font-medium', active || done ? 'text-slate-800' : 'text-slate-400')}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mx-3 h-px flex-1', step > s.no ? 'bg-emerald-400' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ===== 라벨 + 에러/힌트 래퍼 ===== */
function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-indigo-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle size={12} />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
          <Check size={12} />
          {hint}
        </p>
      ) : null}
    </div>
  )
}
