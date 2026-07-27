import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { initTheme } from '@/lib/theme'

// 저장된 테마를 렌더 전에 즉시 적용해 색 깜빡임 방지
initTheme()

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
