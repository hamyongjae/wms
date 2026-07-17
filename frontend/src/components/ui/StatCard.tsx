import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'slate' | 'indigo' | 'emerald' | 'amber'

const toneMap: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
}

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'slate',
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: Tone
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', toneMap[tone])}>
          <Icon size={18} />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
