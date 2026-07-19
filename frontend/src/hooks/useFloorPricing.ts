import { useEffect, useState } from 'react'
import { yardApi } from '@/api/yardApi'
import type { FloorRate } from '@/lib/fee'

/**
 * [층별 단가 공통 로더] 창고의 층(tier)별 단가·최소 보관료를 비동기로 불러와 Map으로 제공.
 * 계약 등록·수정·즉시 입고 팝업이 동일한 소스를 공유해 계산 규칙 파편화를 막는다.
 *
 * @param warehouseId 대상 창고 (null이면 비움)
 * @param active 팝업이 열려 있을 때만 로드 (닫히면 비움)
 */
export function useFloorPricing(warehouseId: number | null, active: boolean): Map<number, FloorRate> {
  const [floorPrices, setFloorPrices] = useState<Map<number, FloorRate>>(new Map())

  useEffect(() => {
    if (!active || warehouseId == null) {
      setFloorPrices(new Map())
      return
    }
    let alive = true
    yardApi
      .floorPrices(warehouseId)
      .then((fp) => {
        if (alive) setFloorPrices(new Map(fp.map((p) => [p.tier, { unitPrice: p.unitPrice, minFee: p.minFee ?? 0 }])))
      })
      .catch(() => alive && setFloorPrices(new Map()))
    return () => {
      alive = false
    }
  }, [warehouseId, active])

  return floorPrices
}
