/*
 * 창고관리시스템 PWA 서비스워커
 * - 정적 셸(HTML/JS/CSS/아이콘)만 캐시해 앱처럼 빠르게 실행
 * - /api 요청은 절대 캐시하지 않음 (항상 최신 데이터)
 * - 오프라인 시 페이지 이동은 캐시된 셸(index.html)로 폴백
 * 캐시 버전만 올리면(예: v1 -> v2) 새 배포가 반영된다.
 */
const CACHE = 'wms-shell-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return   // 외부 도메인은 관여하지 않음
  if (url.pathname.startsWith('/api/')) return       // API는 항상 네트워크(캐시 금지)

  // 페이지 이동(주소창/새로고침): 네트워크 우선, 실패 시 캐시된 셸
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    )
    return
  }

  // 정적 자원(해시된 JS/CSS/이미지): 캐시 우선, 없으면 네트워크 후 캐시에 저장
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy))
        }
        return res
      })
    }),
  )
})
