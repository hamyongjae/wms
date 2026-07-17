import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Loader2, Save, Building2, CheckCircle2 } from 'lucide-react'
import { tenantApi, type TenantInfo } from '@/api/tenantApi'
import { authStorage } from '@/lib/auth'

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
      })
      setTenant(updated)
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
        <h2 className="text-xl font-bold text-slate-800">회사 정보</h2>
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
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}
