import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  FileText,
  Wallet,
  Grid3x3,
  AlertTriangle,
  PackageOpen,
  Truck,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import { orderApi, type StorageOrder } from '@/api/orderApi'
import { billingApi, type BillingLedger } from '@/api/billingApi'
import { yardApi, type WarehouseOccupancy } from '@/api/yardApi'
import StatCard from '@/components/ui/StatCard'
import RevenueBarChart, { type RevenuePoint } from '@/components/charts/RevenueBarChart'
import { authStorage } from '@/lib/auth'

const today = () => new Date().toISOString().slice(0, 10)
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`
const isActive = (s: StorageOrder['status']) => s === 'RECEIVED' || s === 'IN_STORAGE'
const isOverdue = (l: BillingLedger) =>
  l.balance > 0 &&
  (l.status === 'ISSUED' || l.status === 'PARTIALLY_PAID') &&
  l.dueDate != null &&
  l.dueDate < today()

export default function DashboardPage() {
  const user = authStorage.getUser()

  const [orders, setOrders] = useState<StorageOrder[]>([])
  const [ledgers, setLedgers] = useState<BillingLedger[]>([])
  const [occupancy, setOccupancy] = useState<WarehouseOccupancy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      orderApi.list().catch(() => [] as StorageOrder[]),
      billingApi.list().catch(() => [] as BillingLedger[]),
      yardApi.tenantOccupancy().catch(() => [] as WarehouseOccupancy[]),
    ])
      .then(([o, l, occ]) => {
        setOrders(o)
        setLedgers(l)
        setOccupancy(occ)
      })
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const t = today()
    const activeContracts = orders.filter((o) => isActive(o.status)).length
    const outstanding = ledgers.filter((l) => l.status !== 'CANCELED').reduce((s, l) => s + l.balance, 0)
    const overdue = ledgers.filter(isOverdue).length

    const totalSlots = occupancy.reduce((s, w) => s + w.totalSlots, 0)
    const occupiedSlots = occupancy.reduce((s, w) => s + w.occupiedSlots, 0)
    const usage = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0

    const todayInbound = orders.filter((o) => o.storageStartDate === t)
    const todayOutbound = orders.filter(
      (o) => o.actualEndDate === t || (o.expectedEndDate === t && isActive(o.status)),
    )

    return { activeContracts, outstanding, overdue, totalSlots, occupiedSlots, usage, todayInbound, t