import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// PWA 서비스워커 등록 — 홈 화면 설치 + 정적 셸 캐시(오프라인 기본 지원)
// 개발(dev) 모드에서는 등록하지 않는다 — Vite HMR 방해·캐시 꼬임 방지. 운영 빌드에서만 동작.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// [모바일 화면 확대 방어] 뷰포트(user-scalable=no)만으로 안 막히는 iOS 사파리 등을 대비해
//   두 손가락 제스처를 이벤트 레벨에서 무력화한다. 한 손가락 세로 스크롤은 영향받지 않는다.
for (const evt of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(evt, (e) => e.preventDefault(), { passive: false })
}
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault() // 두 손가락 이상 = 핀치 → 차단
  },
  { passive: false },
)
