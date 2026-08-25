import { containerApi } from '@/api/containerApi'
import { nextContainerNo } from '@/lib/containerNo'

/**
 * 특정 계약(주문)에 컨테이너를 만들어 지정 슬롯에 적재·배정하는 파이프라인.
 * 컨테이너 생성 → 계약 배정(assign) → 슬롯 적재(inbound). 화주명은 memo 태그로 함께 남긴다.
 *
 * 계약 등록·수정 두 화면이 공유하므로 페이지가 아닌 lib 에 둔다
 * (페이지끼리 import 하면 순환 참조가 생긴다).
 */
export async function placeContainerAtSlot(
  orderId: number,
  warehouseId: number,
  slotId: number,
  opts: { customerName?: string; inboundDate?: string; outboundDate?: string },
) {
  // 컨테이너 번호는 '업체 전체'에서 유일해야 하므로 전 창고 컨테이너를 기준으로 채번한다.
  const existing = await containerApi.list({})
  const no = nextContainerNo(new Set(existing.map((c) => c.containerNo)))
  const memo = opts.customerName ? `[${opts.customerName}]` : undefined
  const created = await containerApi.create({
    warehouseId,
    containerNo: no,
    memo,
    inboundDate: opts.inboundDate,
    expectedOutboundDate: opts.outboundDate,
  })
  await containerApi.assign(created.id, orderId)
  await containerApi.inbound({ containerId: created.id, targetSlotId: slotId })
}
