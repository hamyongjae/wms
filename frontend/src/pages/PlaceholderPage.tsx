import { Construction } from 'lucide-react'

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-12 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
          <Construction size={22} />
        </div>
        <p className="mt-4 text-base font-semibold text-slate-700">{title}</p>
        <p className="mt-1 text-sm text-slate-400">이 화면은 곧 채워집니다.</p>
      </div>
    </div>
  )
}
