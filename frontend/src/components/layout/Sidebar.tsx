import { useMemo, useState, type DragEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { Boxes, GripVertical } from 'lucide-react'
import { navItems } from './navItems'
import { authStorage } from '@/lib/auth'
import { useMenuOrder, sortByOrder } from '@/hooks/useMenuOrder'
import { cn } from '@/lib/cn'

interface SidebarProps {
  collapsed: boolean
}

export default function Sidebar({ collapsed }: SidebarProps) {
  const isAdmin = authStorage.getUser()?.role === 'ADMIN'

  // 권한 필터 후의 가용 메뉴
  const available = useMemo(() => navItems.filter((item) => !item.adminOnly || isAdmin), [isAdmin])
  const keys = useMemo(() => available.map((i) => i.to), [available])

  const { order, reorder } = useMenuOrder(keys)
  const items = useMemo(() => sortByOrder(available, order), [available, order])

  // 드래그 상태 (인덱스 기준)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function onDragStart(e: DragEvent, index: number) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // 일부 브라우저는 데이터가 있어야 드래그 허용
    e.dataTransfer.setData('text/plain', String(index))
  }
  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== overIndex) setOverIndex(index)
  }
  function onDrop(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== index) reorder(dragIndex, index)
    setDragIndex(null)
    setOverIndex(null)
  }
  function onDragEnd() {
    setDragIndex(null)
    setOverIndex(null)
  }

  const draggable = !collapsed // 접힌 상태에선 드래그 비활성

  return (
    <aside
      className={cn(
        'bg-navy-grid relative flex shrink-0 flex-col border-r border-white/10 bg-[#16233d] transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* 브랜드 */}
      <div className={cn('flex h-14 items-center px-3', collapsed ? 'justify-center' : 'gap-2.5 px-4')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-sm ring-1 ring-white/20">
          <Boxes size={18} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">창고관리시스템</p>
            <p className="text-xs text-slate-400">야적장 관리</p>
          </div>
        )}
      </div>

      {/* 내비게이션 (드래그로 순서 변경) */}
      <nav className="flex-1 space-y-1 px-2 py-3">
        {items.map(({ to, label, icon: Icon }, index) => {
          const isDragging = dragIndex === index
          const isOver = overIndex === index && dragIndex !== null && dragIndex !== index
          return (
            <div
              key={to}
              draggable={draggable}
              onDragStart={(e) => onDragStart(e, index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDrop={(e) => onDrop(e, index)}
              onDragEnd={onDragEnd}
              className={cn(
                'group rounded-lg transition',
                isDragging && 'opacity-50 shadow-md',
                isOver && 'border-t-2 border-indigo-300',
              )}
            >
              <NavLink to={to} title={collapsed ? label : undefined}>
                {({ isActive }) => (
                  <div
                    className={cn(
                      'relative flex items-center rounded-lg px-3 py-2 text-sm transition',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-white/10 font-semibold text-white'
                        : 'font-medium text-slate-300 hover:bg-white/5 hover:text-white',
                    )}
                  >
                    {/* 좌측 포인트 바 */}
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-indigo-300" />}

                    {/* 드래그 핸들 (펼친 상태에서만) */}
                    {draggable && (
                      <GripVertical
                        size={15}
                        className="mr-1 shrink-0 cursor-grab text-slate-500 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
                      />
                    )}

                    <Icon size={19} className="shrink-0" />
                    {!collapsed && <span className="ml-3 truncate">{label}</span>}
                  </div>
                )}
              </NavLink>
            </div>
          )
        })}
      </nav>

      {!collapsed && (
        <p className="px-4 py-3 text-[11px] text-slate-500">메뉴를 드래그해 순서를 바꿀 수 있어요</p>
      )}
    </aside>
  )
}
