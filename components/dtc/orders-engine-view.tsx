'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Download, Eye, Filter, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DtcOrderCustomerField,
  type DtcOrderCustomerSearchHit,
} from '@/components/dtc/dtc-order-customer-field'
import { formatGhs, type OrderStatus } from '@/lib/dtc-orders'
import type { DtcOrdersEngineCustomerJson } from '@/lib/dtc-orders-engine-customer-sheet'
import type { CustomerRow } from '@/components/dtc/customer-intelligence-view'

type OrderRow = {
  id: string
  orderNumber: string
  customer: string
  customerPhone: string
  customerEmail: string
  customerLocation: string
  channel: string
  paymentMethod: 'cash' | 'momo' | 'card' | 'bank_transfer' | 'pay_on_delivery'
  items: { sku?: string; name: string; qty: number; unitPrice: number }[]
  discountGhs: number
  totalAmount: number
  currency: 'GHS'
  status: OrderStatus
  orderedAt: string
  createdAt: string
}

const CHANNELS = ['Web', 'Instagram', 'B2B portal', 'TikTok', 'Other'] as const
const PAYMENT_METHODS = [
  { value: 'momo', label: 'Mobile Money' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'pay_on_delivery', label: 'Pay on delivery' },
] as const

type OrdersSortKey = 'newest' | 'oldest' | 'totalHigh' | 'customerAZ' | 'status' | 'channel'

function normSortText(v: string | undefined | null) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

type DraftItem = {
  sku: string
  name: string
  qty: string
  unitPrice: string
}

type CiAddRowForm = {
  date: string
  orderNumber: string
  itemsOrdered: string
  customerName: string
  phoneNumber: string
  location: string
  riderAssigned: string
  amountToCollectGhs: string
  cashCollectedGhs: string
  momoCollectedGhs: string
  paystackCollectedGhs: string
  totalCollectedGhs: string
  paymentMethod: string
  deliveryStatus: string
  remarks: string
  additionalRemarks: string
}

function customerSearchToFormFields(hit: DtcOrderCustomerSearchHit) {
  return {
    customer: hit.customerName,
    customerPhone: hit.phoneNumber,
    customerEmail: hit.email,
    customerLocation: hit.location,
  }
}

function customerSearchToCiAddFields(hit: DtcOrderCustomerSearchHit) {
  return {
    customerName: hit.customerName,
    phoneNumber: hit.phoneNumber,
    location: hit.location,
  }
}

type CustomerIntelAgg = {
  totalOrders: number
  totalBilled: number
  totalCollected: number
  returnedFormatted: string
}

function aggregateCustomerIntel(customers: Array<Pick<DtcOrdersEngineCustomerJson, 'totalOrders' | 'totalBilledGhs' | 'totalCollectedGhs' | 'returned'>>): CustomerIntelAgg {
  const totalOrders = customers.reduce((s, c) => s + (Number.isFinite(c.totalOrders) ? c.totalOrders : 0), 0)
  const totalBilled = customers.reduce((s, c) => s + (Number.isFinite((c as any).totalBilledGhs) ? (c as any).totalBilledGhs : 0), 0)
  const totalCollected = customers.reduce(
    (s, c) => s + (Number.isFinite((c as any).totalCollectedGhs) ? (c as any).totalCollectedGhs : 0),
    0,
  )
  const returnedSum = customers.reduce(
    (s, c) => s + (Number.isFinite(c.returned) ? c.returned : 0),
    0,
  )
  const returnedFormatted =
    returnedSum === 0
      ? '—'
      : returnedSum.toLocaleString()

  return {
    totalOrders,
    totalBilled,
    totalCollected,
    returnedFormatted,
  }
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

function orderStatusBadge(status: OrderStatus) {
  switch (status) {
    case 'fulfilled':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Fulfilled</Badge>
    case 'processing':
      return <Badge variant="secondary">Processing</Badge>
    case 'pending_payment':
      return <Badge variant="outline">Pending payment</Badge>
    default:
      return null
  }
}

export function OrdersEngineView({ mode = 'orders-engine' }: { mode?: 'orders-engine' | 'customer-intelligence' } = {}) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [ordersTotalCount, setOrdersTotalCount] = useState<number | null>(null)
  const [intelAgg, setIntelAgg] = useState<CustomerIntelAgg | null>(null)
  const [ciSegments, setCiSegments] = useState<{
    highLtv: number
    atRisk: number
    new30d: number
    core: number
  } | null>(null)
  const [ciCustomerCount, setCiCustomerCount] = useState<number | null>(null)
  const [ciAvgTotalBilled, setCiAvgTotalBilled] = useState<number | null>(null)
  const [sheetCustomers, setSheetCustomers] = useState<DtcOrdersEngineCustomerJson[]>([])
  const [intelUniqueCustomers, setIntelUniqueCustomers] = useState<number | null>(null)
  const [intelOrdersByKey, setIntelOrdersByKey] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [importingCustomers, setImportingCustomers] = useState(false)
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<OrdersSortKey>('newest')
  const [sheetRangeStart, setSheetRangeStart] = useState('')
  const [sheetRangeEnd, setSheetRangeEnd] = useState('')
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [editingSheet, setEditingSheet] = useState(false)
  const [editSheetRow, setEditSheetRow] = useState<DtcOrdersEngineCustomerJson | null>(null)
  const [editSheetForm, setEditSheetForm] = useState({
    customerName: '',
    phoneNumber: '',
    location: '',
    totalOrders: '',
    totalBilledGhs: '',
    totalCollectedGhs: '',
    returned: '',
    firstOrderDate: '',
    lastOrderDate: '',
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [ciAddOpen, setCiAddOpen] = useState(false)
  const [ciAdding, setCiAdding] = useState(false)
  const [ciAddForm, setCiAddForm] = useState<CiAddRowForm>({
    date: '',
    orderNumber: '',
    itemsOrdered: '',
    customerName: '',
    phoneNumber: '',
    location: '',
    riderAssigned: '',
    amountToCollectGhs: '',
    cashCollectedGhs: '',
    momoCollectedGhs: '',
    paystackCollectedGhs: '',
    totalCollectedGhs: '',
    paymentMethod: '',
    deliveryStatus: '',
    remarks: '',
    additionalRemarks: '',
  })
  const [viewOpen, setViewOpen] = useState(false)
  const [viewOrder, setViewOrder] = useState<OrderRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null)
  const [editForm, setEditForm] = useState({
    customer: '',
    customerPhone: '',
    customerEmail: '',
    customerLocation: '',
    channel: 'Web' as (typeof CHANNELS)[number],
    orderedAt: toDatetimeLocalValue(new Date()),
    paymentMethod: 'momo' as PaymentMethod,
    status: 'processing' as OrderStatus,
    discountGhs: '',
    items: [{ sku: '', name: '', qty: '1', unitPrice: '' } satisfies DraftItem],
  })
  const [form, setForm] = useState({
    customer: '',
    customerPhone: '',
    customerEmail: '',
    customerLocation: '',
    channel: 'Web' as (typeof CHANNELS)[number],
    orderedAt: toDatetimeLocalValue(new Date()),
    paymentMethod: 'momo' as PaymentMethod,
    status: 'processing' as OrderStatus,
    discountGhs: '',
    items: [
      { sku: '', name: '', qty: '1', unitPrice: '' } satisfies DraftItem,
    ],
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, sheetRes, customersRes, ledgerRes] = await Promise.all([
        fetch('/api/dtc/orders', { credentials: 'include' }),
        fetch('/api/dtc/orders-engine/customers', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/dtc/customers', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/dtc/customer-intelligence', { credentials: 'include', cache: 'no-store' }),
      ])
      if (ordersRes.status === 401 || sheetRes.status === 401 || customersRes.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!ordersRes.ok) {
        throw new Error('Failed to load orders')
      }
      const orderData = (await ordersRes.json()) as { orders: OrderRow[]; totalCount?: number }
      setOrders(orderData.orders)
      const ordersCount =
        Number.isFinite(Number(orderData.totalCount)) ? Number(orderData.totalCount) : orderData.orders.length
      setOrdersTotalCount(Number.isFinite(ordersCount) ? ordersCount : null)

      if (sheetRes.ok) {
        const json = (await sheetRes.json()) as { customers?: DtcOrdersEngineCustomerJson[] }
        const rows = Array.isArray(json.customers) ? json.customers : []
        setSheetCustomers(rows)
      } else {
        setSheetCustomers([])
      }

      if (customersRes.ok) {
        const json = (await customersRes.json()) as {
          customers?: CustomerRow[]
          segments?: { highLtv: number; atRisk: number; new30d: number; core: number }
        }
        const rows = Array.isArray(json.customers) ? json.customers : []
        setCiSegments(json.segments ?? null)
        setCiCustomerCount(rows.length)
        const baseAgg = aggregateCustomerIntel(
          rows.map((c) => ({
            totalOrders: c.totalOrders,
            totalBilledGhs: c.totalBilled,
            totalCollectedGhs: c.totalCollected,
            returned: c.returned,
          })),
        )
        setCiAvgTotalBilled(rows.length ? baseAgg.totalBilled / rows.length : 0)

        // Total orders should represent "how many order rows exist" in Customer Intelligence ledger.
        // (each ledger row = 1 order, including duplicates).
        let ledgerOrders: number | null = null
        let uniqueCustomersByPhone: number | null = null
        let ledgerReturnedCount: number | null = null
        if (ledgerRes.ok) {
          try {
            const ledgerJson = (await ledgerRes.json()) as {
              rows?: Array<{
                phoneNumber?: string
                customerName?: string
                deliveryStatus?: string
                remarks?: string
                additionalRemarks?: string
              }>
            }
            if (Array.isArray(ledgerJson.rows)) {
              ledgerOrders = ledgerJson.rows.length
              const norm = (p: string) => p.replace(/[^\d+]/g, '').trim()
              const orderCounts: Record<string, number> = {}
              const keys = new Set(
                ledgerJson.rows.map((r) => {
                  const p = norm(String(r.phoneNumber ?? ''))
                  const k = p ? `p:${p}` : `n:${String(r.customerName ?? '').trim().toLowerCase()}`
                  orderCounts[k] = (orderCounts[k] ?? 0) + 1
                  return k
                }),
              )
              uniqueCustomersByPhone = keys.size
              setIntelOrdersByKey(orderCounts)

              const isReturnedish = (s: string) => {
                const t = s.trim().toLowerCase()
                return t.includes('returned') || t.includes('return')
              }
              ledgerReturnedCount = ledgerJson.rows.reduce((s, r) => {
                const hit =
                  isReturnedish(String(r.deliveryStatus ?? '')) ||
                  isReturnedish(String(r.remarks ?? '')) ||
                  isReturnedish(String(r.additionalRemarks ?? ''))
                return s + (hit ? 1 : 0)
              }, 0)
            } else {
              ledgerOrders = null
              uniqueCustomersByPhone = null
              ledgerReturnedCount = null
              setIntelOrdersByKey({})
            }
          } catch {
            ledgerOrders = null
            uniqueCustomersByPhone = null
            ledgerReturnedCount = null
            setIntelOrdersByKey({})
          }
        }

        setIntelAgg({
          ...baseAgg,
          totalOrders:
            (ledgerOrders ?? baseAgg.totalOrders) + (Number.isFinite(ordersCount) ? ordersCount : 0),
          returnedFormatted:
            ledgerReturnedCount && ledgerReturnedCount > 0
              ? ledgerReturnedCount.toLocaleString()
              : '—',
        })
        setIntelUniqueCustomers(uniqueCustomersByPhone)
      } else {
        setIntelAgg(null)
        setIntelUniqueCustomers(null)
        setIntelOrdersByKey({})
        setCiSegments(null)
        setCiCustomerCount(null)
        setCiAvgTotalBilled(null)
      }
    } catch {
      toast.error('Could not load orders')
      setSheetCustomers([])
      setIntelAgg(null)
      setIntelUniqueCustomers(null)
      setIntelOrdersByKey({})
      setOrdersTotalCount(null)
      setCiSegments(null)
      setCiCustomerCount(null)
      setCiAvgTotalBilled(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = orders.filter((o) => {
      if (!q) return true
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        o.channel.toLowerCase().includes(q) ||
        (o.customerPhone ?? '').toLowerCase().includes(q) ||
        (o.customerEmail ?? '').toLowerCase().includes(q) ||
        (o.customerLocation ?? '').toLowerCase().includes(q)
      )
    })

    rows.sort((a, b) => {
      const ta = new Date(a.orderedAt).getTime()
      const tb = new Date(b.orderedAt).getTime()
      switch (sortBy) {
        case 'oldest':
          return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
        case 'totalHigh':
          return (b.totalAmount ?? 0) - (a.totalAmount ?? 0) || tb - ta
        case 'customerAZ':
          return (
            normSortText(a.customer).localeCompare(normSortText(b.customer), undefined, {
              numeric: true,
              sensitivity: 'base',
            }) || tb - ta
          )
        case 'status':
          return (
            normSortText(a.status).localeCompare(normSortText(b.status), undefined, {
              numeric: true,
              sensitivity: 'base',
            }) || tb - ta
          )
        case 'channel':
          return (
            normSortText(a.channel).localeCompare(normSortText(b.channel), undefined, {
              numeric: true,
              sensitivity: 'base',
            }) || tb - ta
          )
        case 'newest':
        default:
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
      }
    })

    return rows
  }, [orders, filter, sortBy])

  type EffectiveSheetRow = DtcOrdersEngineCustomerJson & {
    lastOrderId?: string
    lastOrderChannel?: string
    lastOrderPayment?: string
    lastOrderItems?: number
    lastOrderTotal?: number
    lastOrderStatus?: string
    lastOrderAt?: string
  }

  const effectiveSheetCustomers = useMemo(() => {
    const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '').trim()
    const keyFor = (name: string, phone: string) => {
      const p = normalizePhone(phone)
      return p ? `p:${p}` : `n:${normSortText(name)}`
    }
    const ymd = (d: Date) => {
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
      return d.toISOString().slice(0, 10)
    }

    const map = new Map<string, EffectiveSheetRow>()
    for (const c of sheetCustomers) {
      map.set(keyFor(c.customerName ?? '', c.phoneNumber ?? ''), { ...c })
    }

    // "Merge" means: new orders should update/insert into the customer sheet list.
    // We treat each order as +1 totalOrders, and add the order total to billed/collected.
    for (const o of orders) {
      const k = keyFor(o.customer ?? '', o.customerPhone ?? '')
      const existing = map.get(k)
      const orderDate = new Date(o.orderedAt)
      const orderYmd = ymd(orderDate)
      const delta = Number(o.totalAmount ?? 0)
      const orderAtMs = !Number.isNaN(orderDate.getTime()) ? orderDate.getTime() : 0

      if (existing) {
        const first = existing.firstOrderDate
        const last = existing.lastOrderDate
        const nextFirst =
          !first || (orderYmd && first > orderYmd) ? orderYmd : first
        const nextLast =
          !last || (orderYmd && last < orderYmd) ? orderYmd : last
        const existingOrderMs = existing.lastOrderAt ? new Date(existing.lastOrderAt).getTime() : 0
        const shouldReplaceLastOrder =
          !existing.lastOrderAt || (Number.isFinite(orderAtMs) && orderAtMs >= (Number.isFinite(existingOrderMs) ? existingOrderMs : 0))

        map.set(k, {
          ...existing,
          customerName: existing.customerName || o.customer || '',
          phoneNumber: existing.phoneNumber || o.customerPhone || '',
          location: existing.location || o.customerLocation || '',
          totalOrders: Number(existing.totalOrders ?? 0) + 1,
          totalBilledGhs: Number(existing.totalBilledGhs ?? 0) + (Number.isFinite(delta) ? delta : 0),
          totalCollectedGhs: Number(existing.totalCollectedGhs ?? 0) + (Number.isFinite(delta) ? delta : 0),
          firstOrderDate: nextFirst || '',
          lastOrderDate: nextLast || '',
          ...(shouldReplaceLastOrder
            ? {
                lastOrderId: o.orderNumber,
                lastOrderChannel: o.channel,
                lastOrderPayment: o.paymentMethod,
                lastOrderItems: o.items?.length ?? 0,
                lastOrderTotal: Number.isFinite(delta) ? delta : 0,
                lastOrderStatus: o.status,
                lastOrderAt: o.orderedAt,
              }
            : {}),
        })
      } else {
        map.set(k, {
          id: `order:${k}`,
          customerName: o.customer ?? '',
          phoneNumber: o.customerPhone ?? '',
          totalOrders: 1,
          totalBilledGhs: Number.isFinite(delta) ? delta : 0,
          totalCollectedGhs: Number.isFinite(delta) ? delta : 0,
          location: o.customerLocation ?? '',
          returned: 0,
          firstOrderDate: orderYmd || '',
          lastOrderDate: orderYmd || '',
          lastOrderId: o.orderNumber,
          lastOrderChannel: o.channel,
          lastOrderPayment: o.paymentMethod,
          lastOrderItems: o.items?.length ?? 0,
          lastOrderTotal: Number.isFinite(delta) ? delta : 0,
          lastOrderStatus: o.status,
          lastOrderAt: o.orderedAt,
        })
      }
    }

    return Array.from(map.values())
  }, [orders, sheetCustomers])

  const filteredSheetCustomers = useMemo(() => {
    const q = filter.trim().toLowerCase()

    const ymdToMs = (s: string) => {
      const v = String(s ?? '').trim()
      if (!v) return null
      const d = new Date(`${v}T12:00:00`)
      const ms = d.getTime()
      return Number.isNaN(ms) ? null : ms
    }
    const startMs = ymdToMs(sheetRangeStart)
    const endMs = ymdToMs(sheetRangeEnd)

    const rows = (!q
      ? [...effectiveSheetCustomers]
      : effectiveSheetCustomers.filter((c) => {
          const hay = [
            c.customerName,
            c.phoneNumber,
            c.location,
            c.lastOrderId ?? '',
            c.lastOrderChannel ?? '',
            c.lastOrderPayment ?? '',
            String(c.lastOrderStatus ?? ''),
            String(c.lastOrderTotal ?? ''),
            String(c.totalOrders ?? ''),
            String(c.totalBilledGhs ?? ''),
            String(c.totalCollectedGhs ?? ''),
          ]
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        }))

    const rowsInRange = rows.filter((c) => {
      if (startMs == null && endMs == null) return true
      const firstMs = ymdToMs(c.firstOrderDate)
      const lastMs = ymdToMs(c.lastOrderDate)
      // Include row if its [first,last] overlaps the selected [start,end].
      const a = firstMs ?? lastMs ?? null
      const b = lastMs ?? firstMs ?? null
      if (a == null && b == null) return false
      const rowStart = a ?? 0
      const rowEnd = b ?? rowStart
      const selStart = startMs ?? Number.NEGATIVE_INFINITY
      const selEnd = endMs ?? Number.POSITIVE_INFINITY
      return rowEnd >= selStart && rowStart <= selEnd
    })

    rowsInRange.sort((a, b) => {
      switch (sortBy) {
        case 'customerAZ':
          return (
            normSortText(a.customerName).localeCompare(normSortText(b.customerName), undefined, {
              numeric: true,
              sensitivity: 'base',
            }) || 0
          )
        case 'totalHigh':
          return (b.totalBilledGhs ?? 0) - (a.totalBilledGhs ?? 0)
        case 'oldest': {
          const ta = a.lastOrderDate ? new Date(`${a.lastOrderDate}T12:00:00`).getTime() : 0
          const tb = b.lastOrderDate ? new Date(`${b.lastOrderDate}T12:00:00`).getTime() : 0
          return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0)
        }
        case 'newest':
        default: {
          const ta = a.lastOrderDate ? new Date(`${a.lastOrderDate}T12:00:00`).getTime() : 0
          const tb = b.lastOrderDate ? new Date(`${b.lastOrderDate}T12:00:00`).getTime() : 0
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
        }
      }
    })

    return rowsInRange
  }, [effectiveSheetCustomers, filter, sheetRangeStart, sheetRangeEnd, sortBy]) as EffectiveSheetRow[]

  const sheetTotals = useMemo(() => {
    const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '').trim()
    const uniqueCustomerKeys = new Set(
      effectiveSheetCustomers.map((c) => {
        const p = normalizePhone(c.phoneNumber ?? '')
        return p ? `p:${p}` : `n:${normSortText(c.customerName)}`
      }),
    )
    const totalCustomers = uniqueCustomerKeys.size
    const rowCount = effectiveSheetCustomers.length
    const totalOrders = effectiveSheetCustomers.reduce(
      (s, c) => s + (Number.isFinite(Number(c.totalOrders)) ? Number(c.totalOrders) : 0),
      0,
    )
    const totalBilledGhs = effectiveSheetCustomers.reduce(
      (s, c) => s + (Number.isFinite(Number(c.totalBilledGhs)) ? Number(c.totalBilledGhs) : 0),
      0,
    )
    const totalCollectedGhs = effectiveSheetCustomers.reduce(
      (s, c) => s + (Number.isFinite(Number(c.totalCollectedGhs)) ? Number(c.totalCollectedGhs) : 0),
      0,
    )
    return { totalCustomers, rowCount, totalOrders, totalBilledGhs, totalCollectedGhs }
  }, [effectiveSheetCustomers])

  const ordersForSheetRow = useCallback(
    (c: Pick<DtcOrdersEngineCustomerJson, 'phoneNumber' | 'customerName' | 'totalOrders'>) => {
      const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '').trim()
      const p = normalizePhone(c.phoneNumber ?? '')
      const k = p ? `p:${p}` : `n:${normSortText(c.customerName)}`
      return intelOrdersByKey[k] ?? Number(c.totalOrders ?? 0) ?? 0
    },
    [intelOrdersByKey],
  )

  const computedSubtotal = useMemo(() => {
    return form.items.reduce((sum, item) => {
      const qty = Number.parseInt(item.qty, 10)
      const unit = Number.parseFloat(item.unitPrice)
      if (!Number.isFinite(qty) || qty <= 0) return sum
      if (!Number.isFinite(unit) || unit <= 0) return sum
      return sum + qty * unit
    }, 0)
  }, [form.items])

  const computedDiscount = useMemo(() => {
    const d = Number.parseFloat(form.discountGhs)
    if (!Number.isFinite(d) || d <= 0) return 0
    return Math.min(computedSubtotal, d)
  }, [computedSubtotal, form.discountGhs])

  const computedTotal = useMemo(() => {
    return Math.max(0, computedSubtotal - computedDiscount)
  }, [computedDiscount, computedSubtotal])

  const editComputedSubtotal = useMemo(() => {
    return editForm.items.reduce((sum, item) => {
      const qty = Number.parseInt(item.qty, 10)
      const unit = Number.parseFloat(item.unitPrice)
      if (!Number.isFinite(qty) || qty <= 0) return sum
      if (!Number.isFinite(unit) || unit <= 0) return sum
      return sum + qty * unit
    }, 0)
  }, [editForm.items])

  const editComputedDiscount = useMemo(() => {
    const d = Number.parseFloat(editForm.discountGhs)
    if (!Number.isFinite(d) || d <= 0) return 0
    return Math.min(editComputedSubtotal, d)
  }, [editComputedSubtotal, editForm.discountGhs])

  const editComputedTotal = useMemo(() => {
    return Math.max(0, editComputedSubtotal - editComputedDiscount)
  }, [editComputedDiscount, editComputedSubtotal])

  async function removeOrder(order: Pick<OrderRow, 'id' | 'orderNumber'>) {
    if (!window.confirm(`Remove order ${order.orderNumber}? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/dtc/orders/${order.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Could not remove order')
      }
      toast.success('Order removed')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove order')
    }
  }

  async function handleImportCustomersExcel(file: File) {
    setImportingCustomers(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await fetch('/api/dtc/orders-engine/customers/import-file', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        rowCount?: number
      }
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      toast.success(`Imported ${Number(data.rowCount ?? 0).toLocaleString()} customer rows`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImportingCustomers(false)
    }
  }

  function openEditSheetRow(row: DtcOrdersEngineCustomerJson) {
    setEditSheetRow(row)
    setEditSheetForm({
      customerName: row.customerName ?? '',
      phoneNumber: row.phoneNumber ?? '',
      location: row.location ?? '',
      totalOrders: String(row.totalOrders ?? 0),
      totalBilledGhs: String(row.totalBilledGhs ?? 0),
      totalCollectedGhs: String(row.totalCollectedGhs ?? 0),
      returned: String(row.returned ?? 0),
      firstOrderDate: row.firstOrderDate ?? '',
      lastOrderDate: row.lastOrderDate ?? '',
    })
    setEditSheetOpen(true)
  }

  async function submitEditSheetRow(e: React.FormEvent) {
    e.preventDefault()
    if (!editSheetRow) return
    const name = editSheetForm.customerName.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }
    setEditingSheet(true)
    try {
      const res = await fetch(`/api/dtc/orders-engine/customers/${editSheetRow.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          phoneNumber: editSheetForm.phoneNumber.trim() || '',
          location: editSheetForm.location.trim() || '',
          totalOrders: editSheetForm.totalOrders.trim() === '' ? 0 : Number(editSheetForm.totalOrders),
          totalBilledGhs:
            editSheetForm.totalBilledGhs.trim() === '' ? 0 : Number(editSheetForm.totalBilledGhs),
          totalCollectedGhs:
            editSheetForm.totalCollectedGhs.trim() === ''
              ? 0
              : Number(editSheetForm.totalCollectedGhs),
          returned: editSheetForm.returned.trim() === '' ? 0 : Number(editSheetForm.returned),
          firstOrderDate: editSheetForm.firstOrderDate.trim() || undefined,
          lastOrderDate: editSheetForm.lastOrderDate.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not save row')
      toast.success('Row updated')
      setEditSheetOpen(false)
      setEditSheetRow(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save row')
    } finally {
      setEditingSheet(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.customer.trim()) {
      toast.error('Enter a customer')
      return
    }
    if (!form.orderedAt) {
      toast.error('Select an order date')
      return
    }
    if (form.items.length === 0) {
      toast.error('Add at least one item')
      return
    }
    const items = form.items
      .map((i) => ({
        sku: i.sku.trim() ? i.sku.trim() : undefined,
        name: i.name.trim(),
        qty: Number.parseInt(i.qty, 10),
        unitPrice: Number.parseFloat(i.unitPrice),
      }))
      .filter((i) => i.name)
    if (items.length === 0) {
      toast.error('Add at least one item name')
      return
    }
    if (items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0)) {
      toast.error('Each item must have a valid quantity')
      return
    }
    if (items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice <= 0)) {
      toast.error('Each item must have a valid unit price')
      return
    }
    const discountGhs =
      form.discountGhs.trim() === '' ? undefined : Number.parseFloat(form.discountGhs)
    if (discountGhs !== undefined && (!Number.isFinite(discountGhs) || discountGhs < 0)) {
      toast.error('Enter a valid discount amount')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/dtc/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: form.customer.trim(),
          customerPhone: form.customerPhone.trim() || undefined,
          customerEmail: form.customerEmail.trim() || undefined,
          customerLocation: form.customerLocation.trim() || undefined,
          channel: form.channel,
          orderedAt: new Date(form.orderedAt).toISOString(),
          paymentMethod: form.paymentMethod,
          items,
          discountGhs,
          status: form.status,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Could not create order')
      }
      toast.success('Order created')
      setDialogOpen(false)
      setForm({
        customer: '',
        customerPhone: '',
        customerEmail: '',
        customerLocation: '',
        channel: 'Web',
        orderedAt: toDatetimeLocalValue(new Date()),
        paymentMethod: 'momo',
        status: 'processing',
        discountGhs: '',
        items: [{ sku: '', name: '', qty: '1', unitPrice: '' }],
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitCiAddRow(e: React.FormEvent) {
    e.preventDefault()
    const name = ciAddForm.customerName.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }
    setCiAdding(true)
    try {
      const res = await fetch('/api/dtc/customer-intelligence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: ciAddForm.date.trim() || undefined,
          orderNumber: ciAddForm.orderNumber.trim() || undefined,
          itemsOrdered: ciAddForm.itemsOrdered.trim() || undefined,
          customerName: name,
          phoneNumber: ciAddForm.phoneNumber.trim() || undefined,
          location: ciAddForm.location.trim() || undefined,
          riderAssigned: ciAddForm.riderAssigned.trim() || undefined,
          amountToCollectGhs: ciAddForm.amountToCollectGhs.trim() === '' ? 0 : Number(ciAddForm.amountToCollectGhs),
          cashCollectedGhs: ciAddForm.cashCollectedGhs.trim() === '' ? 0 : Number(ciAddForm.cashCollectedGhs),
          momoCollectedGhs: ciAddForm.momoCollectedGhs.trim() === '' ? 0 : Number(ciAddForm.momoCollectedGhs),
          paystackCollectedGhs: ciAddForm.paystackCollectedGhs.trim() === '' ? 0 : Number(ciAddForm.paystackCollectedGhs),
          totalCollectedGhs: ciAddForm.totalCollectedGhs.trim() === '' ? 0 : Number(ciAddForm.totalCollectedGhs),
          paymentMethod: ciAddForm.paymentMethod.trim() || undefined,
          deliveryStatus: ciAddForm.deliveryStatus.trim() || undefined,
          remarks: ciAddForm.remarks.trim() || undefined,
          additionalRemarks: ciAddForm.additionalRemarks.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not add row')
      toast.success('Row added')
      setCiAddOpen(false)
      setCiAddForm({
        date: '',
        orderNumber: '',
        itemsOrdered: '',
        customerName: '',
        phoneNumber: '',
        location: '',
        riderAssigned: '',
        amountToCollectGhs: '',
        cashCollectedGhs: '',
        momoCollectedGhs: '',
        paystackCollectedGhs: '',
        totalCollectedGhs: '',
        paymentMethod: '',
        deliveryStatus: '',
        remarks: '',
        additionalRemarks: '',
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add row')
    } finally {
      setCiAdding(false)
    }
  }

  function openEditOrder(o: OrderRow) {
    setEditOrder(o)
    setEditForm({
      customer: o.customer,
      customerPhone: o.customerPhone ?? '',
      customerEmail: o.customerEmail ?? '',
      customerLocation: o.customerLocation ?? '',
      channel: (CHANNELS.includes(o.channel as any) ? (o.channel as any) : 'Other') as (typeof CHANNELS)[number],
      orderedAt: toDatetimeLocalValue(new Date(o.orderedAt)),
      paymentMethod: o.paymentMethod as PaymentMethod,
      status: o.status,
      discountGhs: o.discountGhs ? String(o.discountGhs) : '',
      items: (o.items ?? []).length
        ? o.items.map((it) => ({
            sku: it.sku ?? '',
            name: it.name ?? '',
            qty: String(it.qty ?? 1),
            unitPrice: String(it.unitPrice ?? ''),
          }))
        : [{ sku: '', name: '', qty: '1', unitPrice: '' }],
    })
    setEditOpen(true)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editOrder) return

    if (!editForm.customer.trim()) {
      toast.error('Enter a customer')
      return
    }
    if (!editForm.orderedAt) {
      toast.error('Select an order date')
      return
    }
    if (editForm.items.length === 0) {
      toast.error('Add at least one item')
      return
    }

    const items = editForm.items
      .map((i) => ({
        sku: i.sku.trim() ? i.sku.trim() : undefined,
        name: i.name.trim(),
        qty: Number.parseInt(i.qty, 10),
        unitPrice: Number.parseFloat(i.unitPrice),
      }))
      .filter((i) => i.name)
    if (items.length === 0) {
      toast.error('Add at least one item name')
      return
    }
    if (items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0)) {
      toast.error('Each item must have a valid quantity')
      return
    }
    if (items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice <= 0)) {
      toast.error('Each item must have a valid unit price')
      return
    }

    const discountGhs =
      editForm.discountGhs.trim() === '' ? null : Number.parseFloat(editForm.discountGhs)
    if (discountGhs !== null && (!Number.isFinite(discountGhs) || discountGhs < 0)) {
      toast.error('Enter a valid discount amount')
      return
    }

    setEditing(true)
    try {
      const res = await fetch(`/api/dtc/orders/${editOrder.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: editForm.customer.trim(),
          customerPhone: editForm.customerPhone.trim(),
          customerEmail: editForm.customerEmail.trim(),
          customerLocation: editForm.customerLocation.trim(),
          channel: editForm.channel,
          orderedAt: new Date(editForm.orderedAt).toISOString(),
          paymentMethod: editForm.paymentMethod,
          items,
          discountGhs: discountGhs === 0 ? null : discountGhs,
          status: editForm.status,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Could not update order')
      }
      toast.success('Order updated')
      setEditOpen(false)
      setEditOrder(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order')
    } finally {
      setEditing(false)
    }
  }

  function openViewOrder(o: OrderRow) {
    setViewOrder(o)
    setViewOpen(true)
  }

  function handleExport() {
    if (orders.length === 0) {
      toast.message('No orders to export yet')
      return
    }
    const header = [
      'orderNumber',
      'customer',
      'customerPhone',
      'customerEmail',
      'customerLocation',
      'channel',
      'paymentMethod',
      'itemsCount',
      'discountGhs',
      'totalAmount',
      'status',
      'orderedAt',
      'createdAt',
    ]
    const lines = [
      header.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          `"${o.customer.replace(/"/g, '""')}"`,
          `"${(o.customerPhone ?? '').replace(/"/g, '""')}"`,
          `"${(o.customerEmail ?? '').replace(/"/g, '""')}"`,
          `"${(o.customerLocation ?? '').replace(/"/g, '""')}"`,
          o.channel,
          o.paymentMethod,
          o.items.length,
          o.discountGhs ?? 0,
          o.totalAmount,
          o.status,
          o.orderedAt,
          o.createdAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title={mode === 'customer-intelligence' ? 'Customer Intelligence' : 'Orders Engine'}
        description="Monitor direct-to-consumer orders across web, social, and partner checkout. Track fulfillment and payment status in one place."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={() => {
                const el = document.getElementById('orders-search')
                el?.focus()
              }}
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleExport}
              disabled={loading || orders.length === 0}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>

            {mode === 'customer-intelligence' ? (
              <Dialog open={ciAddOpen} onOpenChange={setCiAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
                  <form onSubmit={submitCiAddRow} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
                      <DialogTitle>Add customer</DialogTitle>
                      <DialogDescription>Add a Customer Intelligence row (all columns).</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-date">Date</Label>
                          <Input id="oe-ci-date" type="date" value={ciAddForm.date} onChange={(e) => setCiAddForm((f) => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-order">Order #</Label>
                          <Input id="oe-ci-order" value={ciAddForm.orderNumber} onChange={(e) => setCiAddForm((f) => ({ ...f, orderNumber: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-ci-items-full">Items ordered</Label>
                          <Input
                            id="oe-ci-items-full"
                            value={ciAddForm.itemsOrdered}
                            onChange={(e) => setCiAddForm((f) => ({ ...f, itemsOrdered: e.target.value }))}
                            placeholder="e.g. Toothpaste, Mouthwash"
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-ci-name-full">Customer Name</Label>
                          <DtcOrderCustomerField
                            id="oe-ci-name-full"
                            value={ciAddForm.customerName}
                            onChange={(customerName) => setCiAddForm((f) => ({ ...f, customerName }))}
                            onPickCustomer={(hit) =>
                              setCiAddForm((f) => ({ ...f, ...customerSearchToCiAddFields(hit) }))
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-phone-full">Phone Number</Label>
                          <Input id="oe-ci-phone-full" value={ciAddForm.phoneNumber} onChange={(e) => setCiAddForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-location-full">Location</Label>
                          <Input id="oe-ci-location-full" value={ciAddForm.location} onChange={(e) => setCiAddForm((f) => ({ ...f, location: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-rider-full">Rider Assigned</Label>
                          <Input id="oe-ci-rider-full" value={ciAddForm.riderAssigned} onChange={(e) => setCiAddForm((f) => ({ ...f, riderAssigned: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-amt-full">Amount to Collect (GHC)</Label>
                          <Input id="oe-ci-amt-full" type="number" min={0} step="0.01" value={ciAddForm.amountToCollectGhs} onChange={(e) => setCiAddForm((f) => ({ ...f, amountToCollectGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-cash-full">Cash Collected (GHC)</Label>
                          <Input id="oe-ci-cash-full" type="number" min={0} step="0.01" value={ciAddForm.cashCollectedGhs} onChange={(e) => setCiAddForm((f) => ({ ...f, cashCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-momo-full">MoMo Collected (GHC)</Label>
                          <Input id="oe-ci-momo-full" type="number" min={0} step="0.01" value={ciAddForm.momoCollectedGhs} onChange={(e) => setCiAddForm((f) => ({ ...f, momoCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-paystack-full">Paystack Collected (GHC)</Label>
                          <Input id="oe-ci-paystack-full" type="number" min={0} step="0.01" value={ciAddForm.paystackCollectedGhs} onChange={(e) => setCiAddForm((f) => ({ ...f, paystackCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-ci-total-full">Total Collected (GHC)</Label>
                          <Input id="oe-ci-total-full" type="number" min={0} step="0.01" value={ciAddForm.totalCollectedGhs} onChange={(e) => setCiAddForm((f) => ({ ...f, totalCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-paymethod-full">Payment Method</Label>
                          <Input id="oe-ci-paymethod-full" value={ciAddForm.paymentMethod} onChange={(e) => setCiAddForm((f) => ({ ...f, paymentMethod: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-ci-status-full">Delivery Status</Label>
                          <Input id="oe-ci-status-full" value={ciAddForm.deliveryStatus} onChange={(e) => setCiAddForm((f) => ({ ...f, deliveryStatus: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-ci-remarks-full">Remarks</Label>
                          <Input id="oe-ci-remarks-full" value={ciAddForm.remarks} onChange={(e) => setCiAddForm((f) => ({ ...f, remarks: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-ci-additional-full">Additional Remarks</Label>
                          <Input id="oe-ci-additional-full" value={ciAddForm.additionalRemarks} onChange={(e) => setCiAddForm((f) => ({ ...f, additionalRemarks: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                    <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">
                      <Button type="button" variant="outline" onClick={() => setCiAddOpen(false)} disabled={ciAdding}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={ciAdding}>
                        {ciAdding ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          'Add row'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New order
                  </Button>
                </DialogTrigger>
                <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                  <form onSubmit={handleCreate} className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
                      <DialogTitle>New DTC order</DialogTitle>
                      <DialogDescription>
                        Creates a sell-out order in the shared database (live for your team).
                      </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 min-w-0 flex-1 flex-basis-0 overflow-y-auto overflow-x-hidden px-6 py-4">
                      {/* (dialog body unchanged) */}
                      <div className="grid gap-4">
                        {/* existing New order content lives below in this file */}
                      </div>
                    </div>
                    <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          'Create order'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                <form
                  onSubmit={handleEditSubmit}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
                    <DialogTitle>Edit order</DialogTitle>
                    <DialogDescription>
                      Update customer, items, discount, and status. Totals are recalculated.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 min-w-0 flex-1 flex-basis-0 overflow-y-auto overflow-x-hidden px-6 py-4">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-customer">Customer</Label>
                      <DtcOrderCustomerField
                        id="edit-customer"
                        value={editForm.customer}
                        onChange={(customer) => setEditForm((f) => ({ ...f, customer }))}
                        onPickCustomer={(hit) =>
                          setEditForm((f) => ({ ...f, ...customerSearchToFormFields(hit) }))
                        }
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Search by name, phone, email, or location from Customer Intelligence, or type a
                        new name.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-customer-phone">Phone</Label>
                        <Input
                          id="edit-customer-phone"
                          value={editForm.customerPhone}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, customerPhone: e.target.value }))
                          }
                          placeholder="+233 …"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-customer-email">Email</Label>
                        <Input
                          id="edit-customer-email"
                          type="email"
                          value={editForm.customerEmail}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, customerEmail: e.target.value }))
                          }
                          placeholder="name@example.com"
                          autoComplete="email"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="edit-customer-location">Location</Label>
                        <Input
                          id="edit-customer-location"
                          value={editForm.customerLocation}
                          onChange={(e) =>
                            setEditForm((f) => ({ ...f, customerLocation: e.target.value }))
                          }
                          placeholder="City or area"
                          autoComplete="street-address"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="edit-orderedAt">Order date</Label>
                        <Input
                          id="edit-orderedAt"
                          type="datetime-local"
                          value={editForm.orderedAt}
                          onChange={(e) => setEditForm((f) => ({ ...f, orderedAt: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Payment method</Label>
                        <Select
                          value={editForm.paymentMethod}
                          onValueChange={(v) =>
                            setEditForm((f) => ({ ...f, paymentMethod: v as PaymentMethod }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Channel</Label>
                      <Select
                        value={editForm.channel}
                        onValueChange={(v) =>
                          setEditForm((f) => ({ ...f, channel: v as (typeof CHANNELS)[number] }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CHANNELS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Order items</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditForm((f) => ({
                              ...f,
                              items: [...f.items, { sku: '', name: '', qty: '1', unitPrice: '' }],
                            }))
                          }
                        >
                          Add item
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {editForm.items.map((it, idx) => (
                          <div key={idx} className="rounded-lg border border-border p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`edit-item-name-${idx}`}>Item name</Label>
                                <Input
                                  id={`edit-item-name-${idx}`}
                                  value={it.name}
                                  onChange={(e) =>
                                    setEditForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], name: e.target.value }
                                      return { ...f, items }
                                    })
                                  }
                                  required={idx === 0}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-item-sku-${idx}`}>SKU (optional)</Label>
                                <Input
                                  id={`edit-item-sku-${idx}`}
                                  value={it.sku}
                                  onChange={(e) =>
                                    setEditForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], sku: e.target.value }
                                      return { ...f, items }
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                              <div className="space-y-2">
                                <Label htmlFor={`edit-item-qty-${idx}`}>Qty</Label>
                                <Input
                                  id={`edit-item-qty-${idx}`}
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  step={1}
                                  value={it.qty}
                                  onChange={(e) =>
                                    setEditForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], qty: e.target.value }
                                      return { ...f, items }
                                    })
                                  }
                                  required={idx === 0}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-item-unit-${idx}`}>Unit price (GHS)</Label>
                                <Input
                                  id={`edit-item-unit-${idx}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={it.unitPrice}
                                  onChange={(e) =>
                                    setEditForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], unitPrice: e.target.value }
                                      return { ...f, items }
                                    })
                                  }
                                  required={idx === 0}
                                />
                              </div>
                              <div className="flex items-end justify-between gap-2">
                                <div className="text-sm text-muted-foreground">
                                  <span className="block">Line total</span>
                                  <span className="font-medium text-foreground">
                                    {(() => {
                                      const q = Number.parseInt(it.qty, 10)
                                      const u = Number.parseFloat(it.unitPrice)
                                      if (!Number.isFinite(q) || !Number.isFinite(u)) return '—'
                                      return formatGhs(q * u)
                                    })()}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() =>
                                    setEditForm((f) => ({
                                      ...f,
                                      items: f.items.filter((_, i) => i !== idx),
                                    }))
                                  }
                                  disabled={editForm.items.length === 1}
                                  aria-label="Remove item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="edit-order-discount">Discount (GHS)</Label>
                          <Input
                            id="edit-order-discount"
                            inputMode="decimal"
                            value={editForm.discountGhs}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, discountGhs: e.target.value }))
                            }
                            placeholder="0.00"
                          />
                        </div>
                        <div className="rounded-lg bg-muted/30 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Subtotal</p>
                            <p className="text-xs font-medium tabular-nums text-foreground">
                              {formatGhs(editComputedSubtotal)}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Discount</p>
                            <p className="text-xs font-medium tabular-nums text-foreground">
                              {editComputedDiscount > 0 ? `−${formatGhs(editComputedDiscount)}` : '—'}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                            <p className="text-sm font-medium text-foreground">Total</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">
                              {formatGhs(editComputedTotal)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={editForm.status}
                        onValueChange={(v) =>
                          setEditForm((f) => ({ ...f, status: v as OrderStatus }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="pending_payment">Pending payment</SelectItem>
                          <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </div>
                  <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">
                    <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={editing || !editOrder}>
                      {editing ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Save changes'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog
              open={viewOpen}
              onOpenChange={(open) => {
                setViewOpen(open)
                if (!open) setViewOrder(null)
              }}
            >
              <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
                <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
                  <DialogTitle>Order items</DialogTitle>
                  <DialogDescription>
                    {viewOrder ? (
                      <>
                        <span className="font-mono font-medium">{viewOrder.orderNumber}</span> ·{' '}
                        <span className="font-medium">{viewOrder.customer}</span>
                      </>
                    ) : null}
                  </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 min-w-0 flex-1 flex-basis-0 overflow-y-auto overflow-x-hidden px-6 py-4">
                {viewOrder ? (
                  <div className="space-y-4">
                    {(viewOrder.customerPhone ||
                      viewOrder.customerEmail ||
                      viewOrder.customerLocation) && (
                      <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Customer contact
                        </p>
                        <dl className="mt-2 grid gap-1 text-foreground sm:grid-cols-2">
                          {viewOrder.customerPhone ? (
                            <div>
                              <dt className="text-xs text-muted-foreground">Phone</dt>
                              <dd className="tabular-nums">{viewOrder.customerPhone}</dd>
                            </div>
                          ) : null}
                          {viewOrder.customerEmail ? (
                            <div>
                              <dt className="text-xs text-muted-foreground">Email</dt>
                              <dd className="break-all">{viewOrder.customerEmail}</dd>
                            </div>
                          ) : null}
                          {viewOrder.customerLocation ? (
                            <div className="sm:col-span-2">
                              <dt className="text-xs text-muted-foreground">Location</dt>
                              <dd>{viewOrder.customerLocation}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    )}
                    <div className="rounded-lg border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="hidden sm:table-cell">SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit</TableHead>
                            <TableHead className="text-right">Line total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {viewOrder.items.map((it, idx) => (
                            <TableRow key={`${viewOrder.id}-${idx}`}>
                              <TableCell className="font-medium">{it.name}</TableCell>
                              <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                                {it.sku ?? '—'}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">
                                {formatGhs(it.unitPrice)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {formatGhs(it.qty * it.unitPrice)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">Discount</p>
                        <p className="text-xs font-medium tabular-nums text-foreground">
                          {viewOrder.discountGhs > 0
                            ? `−${formatGhs(viewOrder.discountGhs)}`
                            : '—'}
                        </p>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                        <p className="text-sm font-medium text-foreground">Total</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {formatGhs(viewOrder.totalAmount)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                </div>

                <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
                  <Button type="button" variant="outline" onClick={() => setViewOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md flex-1 space-y-2">
            <Label htmlFor="orders-search" className="text-muted-foreground">
              Search orders
            </Label>
            <Input
              id="orders-search"
              placeholder="Order #, customer, phone, email, location, or channel…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:justify-end">
            <div className="w-full min-w-[10rem] space-y-2 sm:w-44">
              <Label htmlFor="orders-sort" className="text-muted-foreground">
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as OrdersSortKey)}>
                <SelectTrigger id="orders-sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="totalHigh">Total (high first)</SelectItem>
                  <SelectItem value="customerAZ">Customer (A–Z)</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="channel">Channel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {filter ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFilter('')}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        {mode === 'customer-intelligence' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Customers tracked
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : (ciCustomerCount ?? 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Unique customer names</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Avg total billed
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : formatGhs(ciAvgTotalBilled ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Per customer (sheet or orders)</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-indigo-600">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                High billed
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : ciSegments?.highLtv ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Billed ≥ GHS 2,000 or 10+ orders</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-red-600">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                At risk
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : ciSegments?.atRisk ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">No order in 60+ days</p>
            </Card>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Customer Intelligence totals
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Sums every tracked customer row (same numbers as Customer Intelligence — sheet values
                where set, otherwise from sell-out orders).
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-teal-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total orders
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {loading || intelAgg === null ? '—' : intelAgg.totalOrders.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {intelUniqueCustomers == null
                    ? 'Across all customers'
                    : `${intelUniqueCustomers.toLocaleString()} unique customers (by phone)`}
                </p>
              </Card>
              <Card className="border-l-4 border-l-cyan-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total billed
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {loading || intelAgg === null ? '—' : formatGhs(intelAgg.totalBilled)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Sum of Total billed column</p>
              </Card>
              <Card className="border-l-4 border-l-sky-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total collected
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {loading || intelAgg === null ? '—' : formatGhs(intelAgg.totalCollected)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Sum of Total collected column</p>
              </Card>
              <Card className="border-l-4 border-l-slate-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Returned
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums">
                  {loading || intelAgg === null ? '—' : intelAgg.returnedFormatted}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sum of Returned column (count)
                </p>
              </Card>
            </div>
          </div>
        )}

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Customer sheet (imported)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This table stays empty until you import an Excel file with the headers above. New orders you create are merged into this list by phone (name fallback).
            </p>
            {!loading && effectiveSheetCustomers.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {sheetTotals.totalCustomers.toLocaleString()} unique customers (by phone){' '}
                {sheetTotals.rowCount !== sheetTotals.totalCustomers
                  ? `· ${sheetTotals.rowCount.toLocaleString()} rows`
                  : ''}{' '}
                · Total orders {sheetTotals.totalOrders.toLocaleString()} · Billed{' '}
                {formatGhs(sheetTotals.totalBilledGhs)} · Collected {formatGhs(sheetTotals.totalCollectedGhs)}
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="oe-sheet-from" className="text-muted-foreground">
                  Date range (from)
                </Label>
                <Input
                  id="oe-sheet-from"
                  type="date"
                  value={sheetRangeStart}
                  onChange={(e) => setSheetRangeStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-sheet-to" className="text-muted-foreground">
                  Date range (to)
                </Label>
                <Input
                  id="oe-sheet-to"
                  type="date"
                  value={sheetRangeEnd}
                  onChange={(e) => setSheetRangeEnd(e.target.value)}
                />
              </div>
              {(sheetRangeStart || sheetRangeEnd) ? (
                <div className="sm:ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSheetRangeStart('')
                      setSheetRangeEnd('')
                    }}
                  >
                    Clear dates
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : effectiveSheetCustomers.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Empty. Click <span className="font-medium">Import customer sheet</span> to upload your Excel.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 min-w-10 text-right tabular-nums text-muted-foreground">
                      #
                    </TableHead>
                    <TableHead className="min-w-[10rem] whitespace-nowrap">Customer Name</TableHead>
                    <TableHead className="min-w-[7rem] whitespace-nowrap">Phone Number</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">Order id</TableHead>
                    <TableHead className="min-w-[10rem] whitespace-nowrap">Customer</TableHead>
                    <TableHead className="hidden sm:table-cell whitespace-nowrap">Channel</TableHead>
                    <TableHead className="hidden lg:table-cell whitespace-nowrap">Payment</TableHead>
                    <TableHead className="hidden lg:table-cell whitespace-nowrap text-right">Items</TableHead>
                    <TableHead className="hidden md:table-cell whitespace-nowrap text-right">Total</TableHead>
                    <TableHead className="hidden md:table-cell whitespace-nowrap">Status</TableHead>
                    <TableHead className="hidden xl:table-cell whitespace-nowrap">Order date</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total Orders</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total Billed (GHC)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total Collected (GHC)</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">Location</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Returned</TableHead>
                    <TableHead className="whitespace-nowrap">First Order Date</TableHead>
                    <TableHead className="whitespace-nowrap">Last Order Date</TableHead>
                    <TableHead className="w-[64px] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSheetCustomers.map((c, i) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-right text-muted-foreground tabular-nums text-sm">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{c.customerName}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {c.phoneNumber || '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {c.lastOrderId || '—'}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">
                        {c.customerName || '—'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap">
                        {c.lastOrderChannel || '—'}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell whitespace-nowrap">
                        {(() => {
                          const pm = c.lastOrderPayment
                          return pm ? <Badge variant="outline">{pm.replace(/_/g, ' ')}</Badge> : '—'
                        })()}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums whitespace-nowrap">
                        {Number(c.lastOrderItems ?? 0) || '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right tabular-nums whitespace-nowrap">
                        {typeof c.lastOrderTotal === 'number'
                          ? formatGhs(c.lastOrderTotal)
                          : '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-nowrap">
                        {c.lastOrderStatus ? orderStatusBadge(c.lastOrderStatus as OrderStatus) : '—'}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground whitespace-nowrap">
                        {c.lastOrderAt
                          ? format(new Date(c.lastOrderAt), 'dd MMM yyyy, HH:mm')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {ordersForSheetRow(c).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatGhs(Number(c.totalBilledGhs ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(Number(c.totalCollectedGhs ?? 0))}
                      </TableCell>
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground" title={c.location}>
                        {c.location || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {Number(c.returned ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.firstOrderDate ? format(new Date(`${c.firstOrderDate}T12:00:00`), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.lastOrderDate ? format(new Date(`${c.lastOrderDate}T12:00:00`), 'dd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditSheetRow(c)}
                          aria-label="Edit customer row"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* Orders list intentionally hidden for now (customer sheet only). */}
      </div>

      <Dialog
        open={editSheetOpen}
        onOpenChange={(open) => {
          setEditSheetOpen(open)
          if (!open) setEditSheetRow(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={submitEditSheetRow} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Edit customer row</DialogTitle>
              <DialogDescription>Updates the imported customer sheet row.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="oe-ci-name">Customer Name</Label>
                <Input
                  id="oe-ci-name"
                  value={editSheetForm.customerName}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, customerName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-phone">Phone Number</Label>
                <Input
                  id="oe-ci-phone"
                  value={editSheetForm.phoneNumber}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-location">Location</Label>
                <Input
                  id="oe-ci-location"
                  value={editSheetForm.location}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-orders">Total Orders</Label>
                <Input
                  id="oe-ci-orders"
                  type="number"
                  min={0}
                  step={1}
                  value={editSheetForm.totalOrders}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, totalOrders: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-returned">Returned (count)</Label>
                <Input
                  id="oe-ci-returned"
                  type="number"
                  min={0}
                  step={1}
                  value={editSheetForm.returned}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, returned: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-billed">Total Billed (GHC)</Label>
                <Input
                  id="oe-ci-billed"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editSheetForm.totalBilledGhs}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, totalBilledGhs: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-collected">Total Collected (GHC)</Label>
                <Input
                  id="oe-ci-collected"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editSheetForm.totalCollectedGhs}
                  onChange={(e) =>
                    setEditSheetForm((f) => ({ ...f, totalCollectedGhs: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-first">First Order Date</Label>
                <Input
                  id="oe-ci-first"
                  type="date"
                  value={editSheetForm.firstOrderDate}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, firstOrderDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe-ci-last">Last Order Date</Label>
                <Input
                  id="oe-ci-last"
                  type="date"
                  value={editSheetForm.lastOrderDate}
                  onChange={(e) => setEditSheetForm((f) => ({ ...f, lastOrderDate: e.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditSheetOpen(false)}
                disabled={editingSheet}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editingSheet}>
                {editingSheet ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
