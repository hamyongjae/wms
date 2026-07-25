/**
 * [계약 ↔ 일정 실시간 동기화 버스]
 *
 * 계약관리 화면에서 상태를 전환(입고/출고)하면 이 버스로 신호를 보내고,
 * 입출고 일정(캘린더) 화면이 구독해 새로고침 없이 데이터를 다시 불러온다.
 *
 * - 백엔드 DB의 단일 이진 상태(status)가 유일한 소스이며,
 *   이 버스는 "그 소스가 바뀌었으니 다시 읽어라"는 무상태 신호만 전달한다.
 * - 화면이 동시에 떠 있지 않아도(라우팅 전환) 다음 진입 시 최신 데이터가 보장된다.
 */
type OrderSyncListener = () => void

const listeners = new Set<OrderSyncListener>()

export const orderSync = {
  /** 계약 상태가 바뀌었음을 알린다 (토글·출고·삭제 성공 직후 호출) */
  emit(): void {
    for (const fn of listeners) {
      try {
        fn()
      } catch {
        // 개별 구독자 오류가 다른 구독자에 전파되지 않도록 격리
      }
    }
  },
  /** 변경 신호를 구독한다. 반환된 함수를 호출하면 구독 해제 */
  subscribe(fn: OrderSyncListener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
