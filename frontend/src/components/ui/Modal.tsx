import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/cn'

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
  footer,
  widthClass = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /**
   * 하단 액션 버튼 영역(선택). 스크롤되는 본문과 분리된 별도 shrink-0 영역에 렌더링되므로
   * 본문이 아무리 길어도 항상 화면에 보인다. `sticky`는 iOS Safari에서 overflow 컨테이너·
   * backdrop-blur와 맞물려 위치가 밀리는 버그가 있어 쓰지 않는다.
   * form 제출 버튼은 이 영역이 <form> 밖에 렌더링되므로 button에 `form="폼id"` 속성으로 연결한다.
   */
  footer?: ReactNode
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
  // body 로 포탈 — 페이지 내 overflow-y-auto 스크롤 컨테이너 안에 중첩되면 iOS Safari에서
  // position:fixed 자식의 스택 순서가 하단 탭 바(별도 fixed 요소)보다 밀려 버튼이 가려진다.
  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="animate-scrim-in absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
        <div
          className="animate-sheet-up relative flex max-h-[92dvh] w-full flex-col overflow-x-hidden rounded-t-3xl bg-white shadow-soft"
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

          {/* 내용 — 시트 내부만 스크롤. footer가 없을 때만 여기서 세이프 에어리어를 확보한다 */}
          <div className={cn('min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5', !footer && 'pb-safe')}>{children}</div>

          {/* 하단 액션 버튼 — 스크롤 영역과 분리된 고정 영역(항상 보임), 세이프 에어리어 존중 */}
          {footer && <div className="pb-safe shrink-0 border-t border-slate-100 bg-white px-5 pb-3 pt-3">{footer}</div>}
        </div>
      </div>,
      document.body,
    )
  }

  // ===== 데스크톱: 센터 다이얼로그 =====
  // 화면보다 큰 폼도 잘리지 않도록 최대 높이 제한 + 헤더 고정 + 본문만 스크롤.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-scrim-in absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`animate-dialog-in shadow-soft relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white ring-1 ring-slate-200/70 ${widthClass}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
