import { containerApi, type Container } from '@/api/containerApi'
import { nextContainerNo } from '@/lib/containerNo'

/**
 * 특정 계약(주문)을 지정 슬롯에 적재·배정하는 파이프라인.
 * opts.existingContainer가 있으면 그 미사용(AVAILABLE) 컨테이너를 그대로 재사용하고,
 * 없으면 새 컨테이너를 만든다 — 이후 계약 배정(assign) → 슬롯 적재(inbound)는 동일.
 * 화주명은 memo 태그로 함께 남긴다(재사용 시에도 최신 화주명으로 갱신).
 *
 * 계약 등록·수정 두 화면이 공유하므로 페이지가 아닌 lib 에 둔다
 * (페이지끼리 import 하면 순환 참조가 생긴다).
 */
export async function placeContainerAtSlot(
  orderId: number,
  warehouseId: number,
  slotId: number,
  opts: { customerName?: string; inboundDate?: string; outboundDate?: string; existingContainer?: Container | null },
) {
  const memo = opts.customerName ? `[${opts.customerName}]` : undefined
  let containerId: number
  if (opts.existingContainer) {
    containerId = opts.existingContainer.id
  } else {
    // 컨테이너 번호는 '업체 전체'에서 유일해야 하므로 전 창고 컨테이너를 기준으로 채번한다.
    const existing = await containerApi.list({})
    const no = nextContainerNo(new Set(existing.map((c) => c.containerNo)))
    const created = await containerApi.create({
      warehouseId,
      containerNo: no,
      memo,
      inboundDate: opts.inboundDate,
      expectedOutboundDate: opts.outboundDate,
    })
    containerId = created.id
  }
  // [배정] STAFF도 허용된 API — 배정과 동시에 컨테이너 입고/출고예정일도 계약 기간으로 상속된다.
  await containerApi.assign(containerId, orderId)
  await containerApi.inbound({ containerId, targetSlotId: slotId })
  // [화주 태그 동기화] 재사용 컨테이너는 memo에 예전 화주명이 남아있을 수 있어 최신으로 맞춘다.
  //   컨테이너 정보 수정은 ADMIN 전용 API라 STAFF가 처리하면 실패할 수 있는데, 배치 자체는
  //   이미 끝난 뒤라 실패해도 조용히 무시한다(memo는 검색·표시용 부가 정보일 뿐).
  if (opts.existingContainer && memo) {
    try {
      await containerApi.update(containerId, { containerNo: opts.existingContainer.containerNo, memo })
    } catch {
      // 무시
    }
  }
}
