import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  open,
  onClose,
  title,
  children,
  widthClass = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 모달 최대 너비 (기본 max-w-md). 2단 레이아웃 등 넓은 폼에 사용. */
  widthClass?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${widthClass} rounded-2xl border border-slate-200 bg-white p-6 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
