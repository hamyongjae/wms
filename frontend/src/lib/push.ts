import { pushApi } from '@/api/pushApi'

/**
 * ===== [긴급 알림 웹 푸시] =====
 * 브라우저 표준 Push API + 기존에 등록돼 있던 서비스워커(public/sw.js, main.tsx에서
 * 프로덕션 빌드에만 등록)를 그대로 쓴다. 개발 서버(vite dev)에는 서비스워커가 없어
 * 이 기능은 배포된 사이트에서만 동작·검증 가능하다.
 *
 * 아이폰(Safari)은 홈 화면에 추가한 뒤 그 아이콘으로 연 상태에서만 알림 권한 요청 자체가
 * 가능하다 — 설정 화면에서 이 사실을 안내한다.
 */

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** VAPID 공개키(base64url) → pushManager.subscribe()가 요구하는 Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  // Uint8Array.from(...)은 최신 TS lib에서 ArrayBufferLike(SharedArrayBuffer 포함)로 추론돼
  // BufferSource(ArrayBuffer 한정)에 안 맞는다 — new Uint8Array(length)로 직접 채운다.
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

export interface PushStatus {
  supported: boolean
  permission: NotificationPermission | 'unsupported'
  subscribed: boolean
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return { supported: false, permission: 'unsupported', subscribed: false }
  const registration = await navigator.serviceWorker.getRegistration()
  const sub = registration ? await registration.pushManager.getSubscription() : null
  return { supported: true, permission: Notification.permission, subscribed: sub != null }
}

/** 권한 요청 → 구독 생성 → 서버에 등록까지 한 번에 처리 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new Error('이 브라우저는 푸시 알림을 지원하지 않습니다.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('알림 권한이 거부됐습니다.')

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    const publicKey = await pushApi.vapidPublicKey()
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // lib.dom의 BufferSource가 ArrayBuffer 한정이라 SharedArrayBuffer도 포함하는
      // Uint8Array<ArrayBufferLike> 반환 타입과 형식상 안 맞는다 — 런타임엔 항상 일반
      // ArrayBuffer라 안전한 캐스팅.
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('구독 정보를 생성하지 못했습니다.')
  }
  await pushApi.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent,
  })
}

/** 브라우저 구독 해제 + 서버에서도 삭제 */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = registration ? await registration.pushManager.getSubscription() : null
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  await pushApi.unsubscribe(endpoint)
}
