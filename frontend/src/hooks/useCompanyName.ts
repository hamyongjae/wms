import { useEffect, useState } from 'react'
import { authStorage } from '@/lib/auth'
import { tenantApi } from '@/api/tenantApi'

/** 로그아웃 상태이거나 업체 정보가 없을 때 안전하게 표시할 기본 시스템명. */
export const DEFAULT_SYSTEM_NAME = '창고관리시스템'

/**
 * 로그인 세션의 '가입 업체명'을 반환하는 훅.
 * - 우선 스토리지 캐시를 즉시 사용(깜빡임 방지)
 * - 캐시가 없고 인증 상태면 tenantApi.me()로 1회 조회 후 캐시
 * - 미인증/정보없음 → 기본 시스템명 폴백
 */
export function useCompanyName(): string {
  const [name, setName] = useState<string | null>(() => authStorage.getTenantName())

  useEffect(() => {
    // 로그아웃 상태면 캐시된 값도 노출하지 않고 기본값으로
    if (!authStorage.isAuthenticated()) {
      setName(null)
      return
    }
    // 이미 캐시가 있으면 재조회하지 않음
    if (authStorage.getTenantName()) return

    let alive = true
    tenantApi
      .me()
      .then((t) => {
        if (!alive) return
        if (t.name?.trim()) {
          authStorage.setTenantName(t.name)
          setName(t.name)
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  return name?.trim() ? name : DEFAULT_SYSTEM_NAME
}
