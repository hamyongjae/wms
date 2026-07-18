import { useRef, useState, type ReactNode, type TouchEvent } from 'react'

/**
 * [창고 맵 제스처] 핀치 투 줌 래퍼 (터치 전용 — 마우스 환경에선 그냥 통과 렌더).
 *  - 두 손가락 핀치: 1.0x ~ 2.5x 확대/축소 (핀치 중심점 유지)
 *  - 확대 상태에서 한 손가락 드래그: 팬(이동, 경계 클램프)
 *  - 더블 탭: 원배율 리셋
 *  - 원배율에서 빠른 좌우 스와이프: onSwipeLeft / onSwipeRight (층 전환용)
 * 확대 중엔 브라우저 스크롤을 막고(touch-action: none), 원배율에선 세로 스크롤을 살린다(pan-y).
 */

const MIN_SCALE = 1
const MAX_SCALE = 2.5
const SWIPE_THRESHOLD = 56 // 층 전환으로 인정할 가로 이동량(px)
const DOUBLE_TAP_MS = 300

export default function PinchZoom({
  children,
  className,
  onSwipeLeft,
  onSwipeRight,
}: {
  children: ReactNode
  className?: string
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)

  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)

  // 제스처 진행 상태 (렌더와 무관 → ref)
  const gesture = useRef<{
    mode: 'none' | 'pinch' | 'pan' | 'swipe'
    startDist: number
    startScale: number
    startTx: number
    startTy: number
    startX: number
    startY: number
    midX: number
    midY: number
    swipeDx: number
    lastTapAt: number
  }>({ mode: 'none', startDist: 0, startScale: 1, startTx: 0, startTy: 0, startX: 0, startY: 0, midX: 0, midY: 0, swipeDx: 0, lastTapAt: 0 })

  /** 확대된 콘텐츠가 컨테이너 밖으로 날아가지 않게 이동량을 가둔다 */
  function clamp(v: number, size: number, s: number): number {
    const min = Math.min(0, size - size * s)
    return Math.max(min, Math.min(0, v))
  }

  function dist(a: React.Touch, b: React.Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
  }

  function onTouchStart(e: TouchEvent) {
    const g = gesture.current
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]]
      const rect = boxRef.current?.getBoundingClientRect()
      g.mode = 'pinch'
      g.startDist = dist(a, b)
      g.startScale = scale
      g.startTx = tx
      g.startTy = ty
      g.midX = (a.clientX + b.clientX) / 2 - (rect?.left ?? 0)
      g.midY = (a.clientY + b.clientY) / 2 - (rect?.top ?? 0)
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      // 더블 탭 → 원배율 리셋
      const now = Date.now()
      if (now - g.lastTapAt < DOUBLE_TAP_MS) {
        setScale(1)
        setTx(0)
        setTy(0)
        g.lastTapAt = 0
        g.mode = 'none'
        return
      }
      g.lastTapAt = now
      g.mode = scale > 1 ? 'pan' : 'swipe'
      g.startX = t.clientX
      g.startY = t.clientY
      g.startTx = tx
      g.startTy = ty
      g.swipeDx = 0
    }
  }

  function onTouchMove(e: TouchEvent) {
    const g = gesture.current
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return

    if (g.mode === 'pinch' && e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1])
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (g.startScale * d) / g.startDist))
      // 핀치 중심점이 화면에서 머물도록 이동량 보정
      const ratio = next / g.startScale
      const nextTx = clamp(g.midX - (g.midX - g.startTx) * ratio, rect.width, next)
      const nextTy = clamp(g.midY - (g.midY - g.startTy) * ratio, rect.height, next)
      setScale(next)
      setTx(next <= 1 ? 0 : nextTx)
      setTy(next <= 1 ? 0 : nextTy)
    } else if (g.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0]
      setTx(clamp(g.startTx + (t.clientX - g.startX), rect.width, scale))
      setTy(clamp(g.startTy + (t.clientY - g.startY), rect.height, scale))
    } else if (g.mode === 'swipe' && e.touches.length === 1) {
      g.swipeDx = e.touches[0].clientX - g.startX
    }
  }

  function onTouchEnd(e: TouchEvent) {
    const g = gesture.current
    if (g.mode === 'swipe' && e.touches.length === 0) {
      // 가로 이동이 충분히 크고 세로 이동보다 우세하면 층 전환
      if (Math.abs(g.swipeDx) > SWIPE_THRESHOLD) {
        if (g.swipeDx < 0) onSwipeLeft?.()
        else onSwipeRight?.()
      }
    }
    if (e.touches.length === 0) g.mode = 'none'
  }

  return (
    <div
      ref={boxRef}
      className={className}
      style={{ overflow: 'hidden', touchAction: scale > 1 ? 'none' : 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        style={{
          transform: scale > 1 ? `translate(${tx}px, ${ty}px) scale(${scale})` : undefined,
          transformOrigin: '0 0',
          transition: gesture.current.mode === 'none' ? 'transform 200ms ease-out' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  )
}
