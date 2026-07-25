import { api } from '@/lib/api'

export interface Warehouse {
  id: number
  name: string
  address?: string
  phone?: string
  tenantId?: number
  createdAt?: string
  updatedAt?: string
}

export interface WarehouseUpsert {
  name: string
  address?: string
  phone?: string
}

export const warehouseApi = {
  async list(): Promise<Warehouse[]> {
    const { data } = await api.get<Warehouse[]>('/api/warehouses')
    return data
  },
  async create(body: WarehouseUpsert): Promise<Warehouse> {
    const { data } = await api.post<Warehouse>('/api/warehouses', body)
    return data
  },
  async update(id: number, body: WarehouseUpsert): Promise<Warehouse> {
    const { data } = await api.put<Warehouse>(`/api/warehouses/${id}`, body)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/api/warehouses/${id}`)
  },
}
