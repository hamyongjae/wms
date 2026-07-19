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

/** 층별 자리 생성: 층(tier)마다 자리 개수(count) 지정 */
export interface FloorGridRequest {
  warehouseId: number
  floors: Array<{ tier: number; count: number }>
}

export const yardApi = {
  async generateGrid(body: GridGenerateRequest): Promise<void> {
    await api.post('/api/yard/slots/generate', body)
  },
  /** 층별 개수로 자리 재생성 (빈 자리 정리 후 N층-번호로 생성) */
  async generateFloors(body: FloorGridRequest): Promise<void> {
    await api.post('/api/yard/slots/generate-floors', body)
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
  // [층별 단가] 창고 층별 단가 목록
  async floorPrices(warehouseId: number): Promise<FloorPrice[]> {
    const { data } = await api.get<FloorPrice[]>('/api/yard/floor-prices', {
      params: { warehouseId },
    })
    return data
  },
  // [층별 단가] 특정 층 단가 설정(upsert)
  async setFloorPrice(body: { warehouseId: number; tier: number; unitPrice: number }): Promise<FloorPrice> {
    const { data } = await api.post<FloorPrice>('/api/yard/floor-prices', body)
    return data
  },
}

export interface FloorPrice {
  warehouseId: number
  tier: number
  unitPrice: number
}
