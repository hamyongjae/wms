import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Loader2, Save, Building2, CheckCircle2, Palette, Check, RotateCcw } from 'lucide-react'
import { tenantApi, type TenantInfo } from '@/api/tenantApi'
import { authStorage } from '@/lib/auth'
import { THEMES, getTheme, applyTheme, previewTheme, DEFAULT_THEME, type ThemeId } from '@/lib/theme'
import { cn } from '@/lib/cn'
import ScheduleColorSettings from '@/components/settings/ScheduleColorSettings'
import Modal from '@/components/ui/Modal'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500'

export default function SettingsPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [tenant, setTenant] = useState<TenantInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [ceoName, setCeo] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [defaultPeriod, setDefaultPeriod] = useState('7')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    tenantApi
      .me()
      .then((t) => {
        setTenant(t)
        setName(t.name ?? '')
        setCeo(t.ceoName ?? '')
        setPhone(t.phone ?? '')
        setEmail(t.email ?? '')
        setAddress(t.address ?? '')
        setDefaultPeriod(String(t.defaultStoragePeriodDays ?? 10))
      })
      .catch(() => setError('업체 정보를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaved(false)
    setSaving(true)
    try {
      const updated = await tenantApi.update({
        name,
        ceoName: ceoName || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        defaultStoragePeriodDays: Number(defaultPeriod) > 0 ? Number(defaultPeriod) : undefined,
      })
      setTenant(updated)
      // 헤더/사이드바 동적 타이틀 캐시 갱신 (업체명 변경 즉시 반영)
      if (updated.name?.trim()) authStorage.setTenantName(updated.name)
      setSaved(true)
    } catch (err) {
      setFormError(isAxiosError(err) ? (err.response?.data?.message ?? '저장에 실패했습니다.') : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">설정</h2>
        <p className="mt-1 text-sm text-slate-500">테마 색상·달력 상태 색상과 회사 기본 정보를 관리합니다.</p>
      </div>

      <ThemeSection />

      <ScheduleColorSettings />

      <div>
        <h3 className="text-lg font-bold text-slate-800">회사 정보</h3>
        <p className="mt-1 text-sm text-slate-500">업체 기본 정보를 관리합니다. 사업자번호는 변경할 수 없습니다.</p>
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

      {!loading && !error && tenant && (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Building2 size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{tenant.name}</p>
              <p className="text-xs text-slate-400">사업자번호 {tenant.businessNumber ?? '—'}</p>
            </div>
          </div>

          {!isAdmin && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              회사 정보 수정은 관리자만 가능합니다. (읽기 전용)
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="업체명 *" className="sm:col-span-2">
              <input value={name} onChange={(e) => setName(e.target.value)} required disabled={!isAdmin} className={inputCls} />
            </Field>
            <Field label="대표자명">
              <input value={ceoName} onChange={(e) => setCeo(e.target.value)} disabled={!isAdmin} className={inputCls} />
            </Field>
            <Field label="연락처">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!isAdmin} className={inputCls} />
            </Field>
            <Field label="이메일" className="sm:col-span-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!isAdmin} className={inputCls} />
            </Field>
            <Field label="주소" className="sm:col-span-2">
              <input value={address} onChange={(e) => setAddress(e.target.value)} disabled={!isAdmin} className={inputCls} />
            </Field>
            <Field label="기본 계약 유지 기간(일)" className="sm:col-span-2">
              <input
                type="number"
                min={1}
                value={defaultPeriod}
                onChange={(e) => setDefaultPeriod(e.target.value)}
                disabled={!isAdmin}
                className={inputCls}
              />
              <p className="mt-1 text-xs text-slate-400">
                당일 포함 보관일수입니다. 예) 10 입력 시 2026.07.21 ~ 2026.07.30 (10일). 계약 등록·즉시 입고의 출고 예정일 기본값에 적용됩니다.
              </p>
            </Field>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          {isAdmin && (
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              {saved && (
                <span className="flex items-center gap-1 text-sm text-emerald-600">
                  <CheckCircle2 size={15} /> 저장되었습니다
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                저장
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

/**
 * ===== [테마(포인트 컬러) 선택] =====
 * 현재 색 배지를 탭하면 팝업이 뜨는 방식 — 달력 상태 색상 설정과 동일한 조작 흐름.
 * 팝업 안에서 고르는 즉시 화면 전체가 미리 칠해지고(저장 전 미리보기), [저장]을 눌러야
 * localStorage에 반영된다. [취소]하면 원래 색으로 되돌아간다.
 */
function ThemeSection() {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState<ThemeId>(() => getTheme())
  const [draft, setDraft] = useState<ThemeId>(saved)

  function openModal() {
    const cur = getTheme()
    setSaved(cur)
    setDraft(cur)
    setOpen(true)
  }
  function pick(id: ThemeId) {
    setDraft(id)
    previewTheme(id)
  }
  function handleReset() {
    setDraft(DEFAULT_THEME)
    previewTheme(DEFAULT_THEME)
  }
  function handleSave() {
    applyTheme(draft)
    setSaved(draft)
    setOpen(false)
  }
  function handleCancel() {
    previewTheme(saved)
    setOpen(false)
  }

  const activeMeta = THEMES.find((t) => t.id === saved)

  return (
    <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Palette size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-800">테마 색상</p>
          <p className="text-xs text-slate-400">앱 전체의 포인트 색상을 바꿉니다. (이 기기에만 저장)</p>
        </div>
      </div>

      {/* 현재 테마 미리보기 — 탭하면 색상 선택 팝업이 바로 뜬다 */}
      <button
        type="button"
        onClick={openModal}
        className="mt-4 flex w-full items-center gap-3 rounded-2xl border-2 border-slate-200 p-3 text-left transition active:scale-[0.99] hover:bg-slate-50 sm:w-auto sm:px-4"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-black/5"
          style={{ backgroundColor: activeMeta?.color }}
        />
        <span className="min-w-0">
          <span className="block text-sm font-bold text-slate-800">{activeMeta?.label ?? '테마'}</span>
          <span className="block text-xs text-slate-400">눌러서 색 바꾸기</span>
        </span>
      </button>

      <Modal
        open={open}
        onClose={handleCancel}
        title="테마 색상"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-3.5 text-sm font-semibold text-slate-600 transition active:bg-slate-50 md:rounded-lg md:py-2"
            >
              <RotateCcw size={15} /> 기본값
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-slate-300 px-4 py-3.5 text-base font-semibold text-slate-600 transition active:bg-slate-50 md:rounded-lg md:py-2 md:text-sm"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-indigo-600 px-5 py-3.5 text-base font-bold text-white transition active:scale-[0.99] md:rounded-lg md:py-2 md:text-sm md:font-medium"
            >
              저장
            </button>
          </div>
        }
      >
        {/* [고령 사용자 접근성] 화면 폭에 맞춰 자연스럽게 줄바꿈되는 원형 스와치 칩.
            선택 상태는 스와치 안 체크 아이콘 + 테두리 강조로 이중 표시한다. */}
        <div className="flex flex-wrap justify-center gap-3">
          {THEMES.map((t) => {
            const active = t.id === draft
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => pick(t.id)}
                aria-pressed={active}
                className={cn(
                  'flex w-20 flex-col items-center gap-1.5 rounded-2xl border-2 py-3 transition',
                  active ? 'border-slate-800 bg-slate-50' : 'border-transparent hover:bg-slate-50',
                )}
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-black/5"
                  style={{ backgroundColor: t.color }}
                >
                  {active && <Check size={20} className="text-white" strokeWidth={3} />}
                </span>
                <span className="text-xs font-semibold text-slate-700">{t.label}</span>
              </button>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}
