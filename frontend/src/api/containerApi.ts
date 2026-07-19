import { api } from '@/lib/api'
import type { Page } from '@/api/yardApi'

export type ContainerStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RETIRED'

export interface Container {
  id: number
  tenantId: number
  warehouseId: number
  warehouseName: string
  containerNo: string
  capacityTon: number
  status: ContainerStatus
  currentOrderId: number | null
  memo: string | null
  inboundDate: string | null
  expectedOutboundDate: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface ContainerCreate {
  warehouseId: number
  containerNo: string
  capacityTon?: number
  memo?: string
  inboundDate?: string
  expectedOutboundDate?: string
}

export interface ContainerUpdate {
  containerNo?: string
  capacityTon?: number
  memo?: string
  inboundDate?: string
  expectedOutboundDate?: string
}

export interface InboundRequest {
  containerId: number
  targetSlotId: number
  memo?: string
}

export interface OutboundRequest {
  containerId: number
  memo?: string
}

export interface MoveRequest {
  containerId: number
  targetSlotId: number
  memo?: string
}

export const containerApi = {
  /** 창고/상태로 필터링된 컨테이너 목록 (전량 로드용 넉넉한 size) */
  async list(params: { warehouseId?: number; status?: ContainerStatus } = {}): Promise<Container[]> {
    const { data } = await api.get<Page<Container>>('/api/containers', {
      params: { ...params, size: 1000 },
    })
    return data.content
  },
  /** [화주명 검색] 창고 내 화주명 일치 컨테이너 id 목록 (하이라이트용) */
  async searchByOwner(warehouseId: number, ownerName: string): Promise<number[]> {
    const { data } = await api.get<number[]>('/api/containers/search-owner', {
      params: { warehouseId, ownerName },
    })
    return data
  },
  async create(body: ContainerCreate): Promise<Container> {
    const { data } = await api.post<Container>('/api/containers', body)
    return data
  },
  async update(id: number, body: ContainerUpdate): Promise<Container> {
    const { data } = await api.put<Container>(`/api/containers/${id}`, body)
    return data
  },
  async changeStatus(id: number, status: ContainerStatus): Promise<Container> {
    const { data } = await api.patch<Container>(`/api/containers/${id}/status`, { status })
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/api/containers/${id}`)
  },
  /** [정합성 정리] 계약과 연결이 끊긴 유령 컨테이너 일괄 정리 → 정리 건수 반환 */
  async cleanupOrphans(): Promise<number> {
    const { data } = await api.post<number>('/api/containers/cleanup-orphans', {})
    return data
  },

  // ===== 보관창고 배치(입고/이동/반출) — 현장(STAFF+) =====
  /** 컨테이너를 특정 계약(주문)에 배정 — 빈(AVAILABLE) 컨테이너 → 사용중 + currentOrder 설정 */
  async assign(containerId: number, orderId: number): Promise<void> {
    await api.post(`/api/containers/${containerId}/assign`, { orderId })
  },
  async inbound(body: InboundRequest): Promise<void> {
    await api.post('/api/yard/inbound', body)
  },
  async move(body: MoveRequest): Promise<void> {
    await api.post('/api/yard/move', body)
  },
  async outbound(body: OutboundRequest): Promise<void> {
    await api.post('/api/yard/outbound', body)
  },
}
