import { useEffect, useRef, useState } from 'react'
import { prefApi } from '@/api/prefApi'

const LS_KEY = 'wms.nav.order'

function loadLocal(): string[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

/** 저장된 순서(saved)와 현재 가용 키(all)를 병합: 알려진 순서 유지 + 신규 키는 뒤에 append + 사라진 키 제거. */
function reconcile(saved: string[] | null, all: string[]): string[] {
  const base = saved ?? []
  const known = base.filter((k) => all.includes(k))
  const missing = all.filter((k) => !known.includes(k))
  return [...known, ...missing]
}

/**
 * 사이드바 메뉴 순서 개인화 훅.
 *
 * [저장 전략] LocalStorage를 우선(즉시 커밋)으로 두고, 백엔드 UserPreference에도
 *   best-effort로 저장을 트리거한다(실패해도 UX는 안 깨짐). 최초 진입 시 로컬이 비어 있으면
 *   백엔드 저장값을 불러와 초기 순서로 채운다.
 */
export function useMenuOrder(allKeys: string[]) {
  const keySig = allKeys.join('|')
  const [order, setOrder] = useState<string[]>(() => reconcile(loadLocal(), allKeys))
  const loadedRemote = useRef(false)

  // 가용 메뉴가 바뀌면(권한 등) 순서 재조정
  useEffect(() => {
    setOrder((prev) => reconcile(prev, allKeys))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig])

  // 최초 1회: 로컬이 비어 있으면 백엔드 저장값을 시도
  useEffect(() => {
    if (loadedRemote.current) return
    loadedRemote.current = true
    if (loadLocal()) return // 로컬 우선
    prefApi
      .getMenuOrder()
      .then((remote) => {
        if (remote.length > 0) setOrder(reconcile(remote, allKeys))
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persist(next: string[]) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next))
    } catch {
      /* 저장 실패 무시 */
    }
    // 백엔드 저장 트리거 (best-effort)
    prefApi.saveMenuOrder(next).catch(() => undefined)
  }

  /** from 인덱스 아이템을 to 인덱스로 이동 (드래그앤드롭 완료 시 호출). */
  function reorder(from: number, to: number) {
    setOrder((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      persist(next)
      return next
    })
  }

  return { order, reorder }
}

/** order 배열 기준으로 items를 정렬 (순수 함수 — order에 없는 항목은 뒤에). */
export function sortByOrder<T extends { to: string }>(items: T[], order: string[]): T[] {
  const idx = new Map(order.map((k, i) => [k, i]))
  return [...items].sort((a, b) => {
    const ia = idx.has(a.to) ? (idx.get(a.to) as number) : Number.MAX_SAFE_INTEGER
    const ib = idx.has(b.to) ? (idx.get(b.to) as number) : Number.MAX_SAFE_INTEGER
    return ia - ib
  })
}
