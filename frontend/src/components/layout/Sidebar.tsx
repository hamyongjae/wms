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
        'flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* 브랜드 */}
      <div className={cn('flex h-14 items-center px-3', collapsed ? 'justify-center' : 'gap-2.5 px-4')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm">
          <Boxes size={18} />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-800">WMS</p>
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
              onDragStart={(e) 