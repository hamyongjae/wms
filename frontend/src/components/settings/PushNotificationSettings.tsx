import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/cn'
import { getPushStatus, enablePush, disablePush, isPushSupported, type PushStatus } from '@/lib/push'
import { pushApi } from '@/api/pushApi'

/**
 * ===== [긴급 알림 웹 푸시 설정] =====
 * 연체처럼 긴급한 알림만 휴대폰으로 받을 수 있게 켜고 끈다. 서비스워커는
 * 프로덕션 배포에만 등록돼 있어(main.tsx) 개발 서버에서는 항상 "미지원"으로 보인다 — 정상.
 */
export default function PushNotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  useEffect(() => {
    getPushStatus().then(setStatus)
  }, [])

  async function handleTest() {
    setTestBusy(true)
    setTestResult(null)
    try {
      const sent = await pushApi.sendTest()
      setTestResult(sent > 0 ? '전송했습니다. 잠시 후 알림을 확인하세요.' : '등록된 구독이 없습니다. 먼저 알림을 켜주세요.')
    } catch {
      setTestResult('테스트 발송에 실패했습니다.')
    } finally {
      setTestBusy(false)
    }
  }

  async function handleToggle() {
    if (!status) return
    setBusy(true)
    setError(null)
    try {
      if (status.subscribed) {
        await disablePush()
      } else {
        await enablePush()
      }
      setStatus(await getPushStatus())
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const subscribed = status?.subscribed ?? false
  const supported = status?.supported ?? true // 상태 조회 전 깜빡임 방지 — 로딩 중엔 지원한다고 가정

  return (
    <div className="rounded-2xl bg-white p-6 shadow-soft ring-1 ring-slate-200/60">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Bell size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">긴급 알림</p>
          <p className="text-xs text-slate-400">연체 등 긴급한 알림만 휴대폰으로 받습니다. (이 기기에만 적용)</p>
        </div>
      </div>

      <div className="mt-4">
        {!isPushSupported() && status != null ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
            이 브라우저는 푸시 알림을 지원하지 않습니다.
          </p>
        ) : status?.permission === 'denied' ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            알림 권한이 차단돼 있습니다. 브라우저 주소창 옆 자물쇠 아이콘에서 알림 권한을 허용한 뒤 다시 시도하세요.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleToggle}
            disabled={busy || !supported}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl border-2 p-3.5 text-left transition disabled:opacity-60',
              subscribed ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:bg-slate-50',
            )}
          >
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                subscribed ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400',
              )}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : subscribed ? <Bell size={18} /> : <BellOff size={18} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">
                {subscribed ? '휴대폰 알림 켜짐' : '휴대폰 알림 꺼짐'}
              </span>
              <span className="block text-xs text-slate-400">
                {busy ? '처리 중…' : subscribed ? '눌러서 끄기' : '눌러서 이 기기로 알림 받기'}
              </span>
            </span>
          </button>
        )}

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {subscribed && (
          <>
            <button
              type="button"
              onClick={handleTest}
              disabled={testBusy}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {testBusy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              테스트 알림 보내기
            </button>
            {testResult && <p className="mt-1.5 text-center text-xs text-slate-500">{testResult}</p>}
          </>
        )}

        <p className="mt-3 text-[11px] text-slate-400">
          아이폰(Safari)은 이 페이지를 홈 화면에 추가한 뒤, 그 아이콘으로 연 상태에서만 알림을 받을 수 있어요.
        </p>
      </div>
    </div>
  )
}
