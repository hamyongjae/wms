import { useState } from 'react'
import { Plus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * [엄지 존] 모바일 전용 플로팅 액션 버튼.
 *  - 액션이 1개면: 탭 즉시 실행.
 *  - 여러 개면: 탭 시 위로 순차(stagger) 펼침 + 배경 스크림, FAB 아이콘은 ×로 회전.
 * 위치는 매직 넘버 대신 --tabbar-total(탭 바 높이 + 세이프 에어리어) 기준선을 공유한다.
 * 덕분에 홈 인디케이터가 있는 기기에서도 탭 바와 절대 겹치지 않는다. md 이상에선 렌더되지 않는다.
 */

export interface FabAction {
  label: string
  icon: LucideIcon
  onClick: () => void
}

export default function Fab({ actions }: { actions: FabAction[] }) {
  const [open, setOpen] = useState(false)

  if (actions.length === 0) return null
  const single = actions.length === 1

  function handleMain() {
    if (single) actions[0].onClick()
    else setOpen((v) => !v)
  }

  return (
    <div className="md:hidden">
      {/* 펼침 시 배경 스크림 — 탭하면 닫힘 */}
      {open && (
        <div className="animate-scrim-in fixed inset-0 z-40 bg-slate-900/30" onClick={() => setOpen(false)} />
      )}

      {/* 펼쳐지는 액션들 (아래→위 스태거) */}
      {!single && (
        <div className="bottom-above-fab fixed right-4 z-50 flex flex-col items-end gap-2.5">
          {open &&
            actions.map((a, i) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  a.onClick()
                }}
                className="card-press animate-scrim-in flex items-center gap-2 rounded-full bg-white py-2 pl-4 pr-3 text-sm font-medium text-slate-700 shadow-soft"
                style={{ animationDelay: `${(actions.length - 1 - i) * 30}ms`, animationFillMode: 'backwards' }}
              >
                {a.label}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <a.icon size={16} />
                </span>
              </button>
            ))}
        </div>
      )}

      {/* 메인 FAB */}
      <button
        type="button"
        onClick={handleMain}
        aria-label={single ? actions[0].label : '빠른 작업'}
        className={cn(
          'card-press bottom-above-tabbar fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-soft transition',
          open ? 'rotate-45 bg-slate-700' : 'bg-indigo-600 hover:bg-indigo-700',
        )}
        style={{ transition: 'transform 240ms ease-out, background-color 200ms ease-out' }}
      >
        {/* 액션 1개면 그 아이콘, 여러 개면 + 아이콘 (펼침 시 버튼 회전으로 ×가 된다) */}
        {single ? (() => { const Icon = actions[0].icon; return <Icon size={24} /> })() : <Plus size={24} />}
      </button>
    </div>
  )
}
