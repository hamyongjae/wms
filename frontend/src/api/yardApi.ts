import { api } from '@/lib/api'

export interface BlockOccupancy {
  block: string
  totalSlots: number
  occupiedSlots: number
  availableSlots: number
  occupancyRate: number
}

export interface WarehouseOccupancy {
  warehouseId: number
  warehouseName: string
  totalSlots: number
  occupiedSlots: number
  availableSlots: number
  occupancyRate: number
  vacancyRate: number
  blocks: BlockOccupancy[] | null
}

export interface YardSlot {
  id: number
  warehouseId: number
  warehouseName: string
  block: string
  rowNo: number
  columnNo: number
  tier: number
  locationLabel: string
  occupied: boolean
  containerId: number | null
  containerNo: string | null
}

// Spring Data Page 응답의 최소 형태
export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface GridGenerateRequest {
  warehouseId: number
  block: string
  rows: number
  columns: number
  tiers: number
}

export const yardApi = {
  async generateGrid(body: GridGenerateRequest): Promise<void> {
    await api.post('/api/yard/slots/generate', body)
  },
  async warehouseOccupancy(warehouseId: number): Promise<WarehouseOccupancy> {
    const { data } = await api.get<WarehouseOccupancy>(`/api/yard/occupancy/${warehouseId}`)
    return data
  },
  // 테넌트 전체: 창고별 점유 요약 배열
  async tenantOccupancy(): Promise<WarehouseOccupancy[]> {
    const { data } = await api.get<WarehouseOccupancy[]>('/api/yard/occupancy')
    return data
  },
  async slots(warehouseId: number): Promise<YardSlot[]> {
    // 보관창고은 경계가 있어 전량 로드해도 무방 (넉넉히 size 지정)
    const { data } = await api.get<Page<YardSlot>>('/api/yard/slots', {
      params: { warehouseId, size: 2000 },
    })
    return data.content
  },
}
