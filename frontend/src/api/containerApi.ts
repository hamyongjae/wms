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
  currentOrderNumber: string | null
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

  // ===== 야적장 배치(입고/이동/반출) — 현장(STAFF+) =====
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
