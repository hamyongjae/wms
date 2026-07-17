import { useEffect, useState, type FormEvent } from 'react'
import { isAxiosError } from 'axios'
import { Plus, Pencil, Trash2, Loader2, Warehouse as WarehouseIcon } from 'lucide-react'
import { warehouseApi, type Warehouse } from '@/api/warehouseApi'
import { authStorage } from '@/lib/auth'
import Modal from '@/components/ui/Modal'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'

export default function WarehousesPage() {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  const [items, setItems] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function load() {
    setLoading(true)
    warehouseApi
      .list()
      .then(setItems)
      .catch(() => setError('창고 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function openCreate() {
    setEditingId(null)
    setName('')
    setAddress('')
    setPhone('')
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(w: Warehouse) {
    setEditingId(w.id)
    setName(w.name)
    setAddress(w.address ?? '')
    setPhone(w.phone ?? '')
    setFormError(null)
    setModalOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const body = { name, address: address || undefined, phone: phone || undefined }
      if (editingId == null) await warehouseApi.create(body)
      else await warehouseApi.update(editingId, body)
      setModalOpen(false)
      load()
    } catch (err) {
      setFormError(
        isAxiosError(err) ? (err.response?.data?.message ?? '저장에 실패했습니다.') : '저장에 실패했습니다.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(w: Warehouse) {
    if (!window.confirm(`'${w.name}' 창고를 삭제할까요?`)) return
    try {
      await warehouseApi.remove(w.id)
      load()
    } catch (err) {
      alert(
        isAxiosError(err)
          ? (err.response?.data?.message ?? '삭제에 실패했습니다. (배치된 컨테이너/슬롯이 있는지 확인하세요)')
          : '삭제에 실패했습니다.',
      )
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">창고 관리</h2>
          <p className="mt-1 text-sm text-slate-500">구역 및 보관 시설을 등록·관리합니다.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Plus size={16} />
            창고 추가
          </button>
        )}
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
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
            <WarehouseIcon size={22} />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-700">등록된 창고가 없습니다</p>
          <p className="mt-1 text-sm text-slate-400">첫 창고를 추가해 야적장 운영을 시작하세요.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="px-5 py-3 font-medium">창고명</th>
                <th className="px-5 py-3 font-medium">주소</th>
                <th className="px-5 py-3 font-medium">연락처</th>
                {isAdmin && <th className="px-5 py-3 text-right font-medium">작업</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((w) => (
                <tr key={w.id} className="transition hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{w.name}</td>
                  <td className="px-5 py-3 text-slate-500">{w.address || '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{w.phone || '—'}</td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(w)}
                          title="수정"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(w)}
                          title="삭제"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId == null ? '창고 추가' : '창고 수정'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">창고명 *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">주소</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">연락처</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? '저장 중…' : '저장'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
