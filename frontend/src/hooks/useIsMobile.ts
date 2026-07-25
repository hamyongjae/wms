import { useEffect, useState } from 'react'

/**
 * 뷰포트가 모바일 폭(<768px, Tailwind md 미만)인지 — 리사이즈에 실시간 반응.
 * 형태 승격 규칙(바텀 시트/탭 바/층 스와이프)의 공용 판단 기준.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
