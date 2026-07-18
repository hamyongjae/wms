import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'

/**
 * [형태 승격 규칙] 같은 내용, 다른 그릇.
 *  - 모바일(<768px): 하단에서 올라오는 바텀 시트 — 그래버 핸들, 아래로 스와이프해 닫기, 세이프 에어리어.
 *  - 데스크톱(≥768px): 기존 센터 다이얼로그.
 * 호출부 API는 동일하므로 모든 기존 팝업이 자동으로 승격된다.
 */

/** 스와이프 다운으로 닫히는 임계 이동량(px) */
const CLOSE_THRESHOLD = 90

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
  const isMobile = useIsMobile()

  // ===== 바텀 시트 드래그(스와이프 다운 닫기) =====
  const startYRef = useRef<number | null>(null)
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)

  // 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // 닫힐 때 드래그 상태 초기화
  useEffect(() => {
    if (!open) {
      setDragY(0)
      setDragging(false)
      startYRef.current = null
    }
  }, [open])

  if (!open) return null

  function onGrabTouchStart(e: TouchEvent) {
    startYRef.current = e.touches[0].clientY
    setDragging(true)
  }
  function onGrabTouchMove(e: TouchEvent) {
    if (startYRef.current == null) return
    const delta = e.touches[0].clientY - startYRef.current
    setDragY(Math.max(0, delta)) // 위로는 끌 수 없음(러버밴딩 대신 고정)
  }
  function onGrabTouchEnd() {
    setDragging(false)
    if (dragY > CLOSE_THRESHOLD) {
      onClose()
    } else {
      setDragY(0) // 임계 미달 → 부드럽게 원위치
    }
    startYRef.current = null
  }

  // ===== 모바일: 바텀 시트 =====
  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="animate-scrim-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
        <div
          className="animate-sheet-up relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-soft"
          style={{
            transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
            transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        >
          {/* 그래버 + 헤더 — 이 영역을 잡고 아래로 스와이프하면 닫힌다 */}
          <div
            className="shrink-0 touch-none select-none"
            onTouchStart={onGrabTouchStart}
            onTouchMove={onGrabTouchMove}
            onTouchEnd={onGrabTouchEnd}
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <span className="h-1 w-9 rounded-full bg-slate-300" />
            </div>
            <div className="flex items-center justify-between px-5 pb-3 pt-1">
              <h3 className="text-base font-semibold text-slate-800">{title}</h3>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 내용 — 시트 내부만 스크롤, 하단 세이프 에어리어 존중 */}
          <div className="pb-safe min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </div>
      </div>
    )
  }

  // ===== 데스크톱: 센터 다이얼로그 =====
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-scrim-in absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`shadow-soft relative w-full ${widthClass} rounded-2xl border border-slate-200 bg-white p-6`}>
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
