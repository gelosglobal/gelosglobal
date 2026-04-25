'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO, subDays, subMonths } from 'date-fns'
import { Download, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
import { cn } from '@/lib/utils'
import { formatGhs } from '@/lib/dtc-orders'
import { DtcOrderCustomerField, type DtcOrderCustomerSearchHit } from '@/components/dtc/dtc-order-customer-field'

export type CustomerSegment = 'High LTV' | 'At risk' | 'New (30d)' | 'Core'

/** Must match `app/api/dtc/customers/reset/route.ts`. */
const CLEAR_DTC_CUSTOMERS_CONFIRM = 'CLEAR_ALL_DTC_CUSTOMERS'

export type CustomerIntelLedgerRow = {
  id: string
  orderedAt: string | null
  orderNumber: string
  itemsOrdered: string
  items?: Array<{ sku?: string; name: string; qty: number; unitPrice: number }>
  customerName: string
  phoneNumber: string
  location: string
  riderAssigned: string
  amountToCollectGhs: number
  cashCollectedGhs: number
  momoCollectedGhs: number
  paystackCollectedGhs: number
  totalCollectedGhs: number
  paymentMethod: string
  deliveryStatus: string
  remarks: string
  additionalRemarks: string
}

const DELIVERY_STATUS_NONE = '__none__'

const DELIVERY_STATUS_OPTIONS = [
  { value: DELIVERY_STATUS_NONE, label: 'Not set' },
  { value: 'Fulfilled', label: 'Fulfilled' },
  { value: 'Processing', label: 'Processing' },
  { value: 'Out for delivery', label: 'Out for delivery' },
  { value: 'Cancelled', label: 'Cancelled' },
  { value: 'Returned', label: 'Returned' },
] as const

function deliveryStatusBadge(value: string) {
  const v = String(value ?? '').trim()
  if (!v || v === DELIVERY_STATUS_NONE) return <Badge variant="outline">—</Badge>
  const key = v.toLowerCase()
  if (key.includes('fulfill')) return <Badge className="bg-emerald-600 hover:bg-emerald-600">{v}</Badge>
  if (key.includes('process')) return <Badge variant="secondary">{v}</Badge>
  if (key.includes('out')) return <Badge className="bg-blue-600 hover:bg-blue-600">{v}</Badge>
  if (key.includes('return')) return <Badge className="bg-amber-600 hover:bg-amber-600">{v}</Badge>
  if (key.includes('cancel')) return <Badge variant="destructive">{v}</Badge>
  return <Badge variant="outline">{v}</Badge>
}

type OrdersEngineOrderRow = {
  id: string
  orderNumber: string
  customer: string
  customerPhone?: string
  customerLocation?: string
  paymentMethod?: string
  items?: Array<{ name: string; qty: number }>
  totalAmount?: number
  status?: string
  orderedAt?: string
}

/** Matches GET `/api/dtc/customers` — same field names as the on-page table headers. */
export type CustomerRow = {
  id: string
  customerName: string
  phoneNumber: string
  totalOrders: number
  totalBilled: number
  totalCollected: number
  location: string
  returned: number
  firstOrderDate: string
  lastOrderDate: string
  totalBilledFormatted: string
  totalCollectedFormatted: string
  returnedFormatted: string
  segment: CustomerSegment
  computedSegment: CustomerSegment
}

type SegmentCounts = {
  highLtv: number
  atRisk: number
  new30d: number
  core: number
}

type CustomerSortKey = 'date' | 'amountToCollect' | 'totalCollected' | 'name'

function fmtTableDate(s: string): string {
  if (!s?.trim()) return '—'
  try {
    const d = s.includes('T') ? parseISO(s) : parseISO(`${s}T12:00:00`)
    return Number.isNaN(d.getTime()) ? s : format(d, 'dd MMM yyyy')
  } catch {
    return s
  }
}

function todayLocalYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type RangePreset = 'all' | '7d' | '1m' | '3m' | '6m' | '12m' | 'custom'

function computeRangeTs(preset: RangePreset, fromYmd: string, toYmd: string) {
  const now = new Date()
  if (preset === 'all') return { fromTs: null as number | null, toTs: null as number | null }
  if (preset === 'custom') {
    const fromTs = fromYmd ? new Date(`${fromYmd}T00:00:00.000Z`).getTime() : null
    const toTs = toYmd ? new Date(`${toYmd}T23:59:59.999Z`).getTime() : null
    return {
      fromTs: Number.isFinite(fromTs as number) ? (fromTs as number) : null,
      toTs: Number.isFinite(toTs as number) ? (toTs as number) : null,
    }
  }
  const end = now.getTime()
  const startDate =
    preset === '7d'
      ? subDays(now, 7)
      : preset === '1m'
        ? subMonths(now, 1)
        : preset === '3m'
          ? subMonths(now, 3)
          : preset === '6m'
            ? subMonths(now, 6)
            : subMonths(now, 12)
  return { fromTs: startDate.getTime(), toTs: end }
}

export function CustomerIntelligenceView({
  mode = 'customer-intelligence',
}: {
  mode?: 'orders-engine' | 'customer-intelligence'
} = {}) {
  type DraftItem = { sku: string; name: string; qty: string; unitPrice: string }
  const parseItemsOrderedToDraftItems = (s: string): DraftItem[] => {
    const raw = String(s ?? '').trim()
    if (!raw) return [{ sku: '', name: '', qty: '1', unitPrice: '' }]
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const items = parts.map((p) => {
      const m = p.match(/^(.*?)(?:\s*x\s*(\d+))?$/i)
      const name = String(m?.[1] ?? p).trim()
      const qty = String(m?.[2] ?? '1').trim()
      return { sku: '', name, qty: qty || '1', unitPrice: '' }
    })
    return items.length ? items : [{ sku: '', name: '', qty: '1', unitPrice: '' }]
  }

  const draftItemsToItemsOrdered = (items: DraftItem[]) =>
    items
      .map((it) => {
        const n = it.name.trim()
        if (!n) return ''
        const q = Number.parseInt(it.qty, 10)
        const qty = Number.isFinite(q) && q > 1 ? ` x${q}` : ''
        return `${n}${qty}`
      })
      .filter(Boolean)
      .join(', ')

  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [ledgerRows, setLedgerRows] = useState<CustomerIntelLedgerRow[]>([])
  const [segments, setSegments] = useState<SegmentCounts | null>(null)
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearPhrase, setClearPhrase] = useState('')
  const [clearing, setClearing] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(false)
  const [editRow, setEditRow] = useState<CustomerIntelLedgerRow | null>(null)
  const [editForm, setEditForm] = useState({
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
    items: [{ sku: '', name: '', qty: '1', unitPrice: '' } satisfies DraftItem],
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [newOrderSubmitting, setNewOrderSubmitting] = useState(false)
  const [sortBy, setSortBy] = useState<CustomerSortKey>('date')
  const [rangePreset, setRangePreset] = useState<RangePreset>('all')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [createForm, setCreateForm] = useState({
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

  const [newOrderForm, setNewOrderForm] = useState({
    date: todayLocalYmd(),
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
    deliveryStatus: DELIVERY_STATUS_NONE,
    remarks: '',
    additionalRemarks: '',
    items: [{ sku: '', name: '', qty: '1', unitPrice: '' } satisfies DraftItem],
  })

  function customerSearchToFormFields(hit: DtcOrderCustomerSearchHit) {
    return {
      customerName: hit.customerName,
      phoneNumber: hit.phoneNumber,
      location: hit.location,
    }
  }

  async function submitNewOrder(e: React.FormEvent) {
    e.preventDefault()
    const name = newOrderForm.customerName.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }
    const computedItemsOrdered = newOrderForm.items
      .map((it) => {
        const n = it.name.trim()
        if (!n) return ''
        const q = Number.parseInt(it.qty, 10)
        const qty = Number.isFinite(q) && q > 1 ? ` x${q}` : ''
        return `${n}${qty}`
      })
      .filter(Boolean)
      .join(', ')
    const computedSubtotal = newOrderForm.items.reduce((sum, it) => {
      const q = Number.parseInt(it.qty, 10)
      const u = Number.parseFloat(it.unitPrice)
      if (!Number.isFinite(q) || q <= 0) return sum
      if (!Number.isFinite(u) || u < 0) return sum
      return sum + q * u
    }, 0)

    setNewOrderSubmitting(true)
    try {
      const res = await fetch('/api/dtc/customer-intelligence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: newOrderForm.date.trim() || undefined,
          orderNumber: newOrderForm.orderNumber.trim() || undefined,
          itemsOrdered: computedItemsOrdered || undefined,
          customerName: name,
          phoneNumber: newOrderForm.phoneNumber.trim() || undefined,
          location: newOrderForm.location.trim() || undefined,
          riderAssigned: newOrderForm.riderAssigned.trim() || undefined,
          amountToCollectGhs:
            newOrderForm.amountToCollectGhs.trim() === ''
              ? computedSubtotal
              : Number(newOrderForm.amountToCollectGhs),
          cashCollectedGhs: newOrderForm.cashCollectedGhs.trim() === '' ? 0 : Number(newOrderForm.cashCollectedGhs),
          momoCollectedGhs: newOrderForm.momoCollectedGhs.trim() === '' ? 0 : Number(newOrderForm.momoCollectedGhs),
          paystackCollectedGhs: newOrderForm.paystackCollectedGhs.trim() === '' ? 0 : Number(newOrderForm.paystackCollectedGhs),
          totalCollectedGhs: newOrderForm.totalCollectedGhs.trim() === '' ? 0 : Number(newOrderForm.totalCollectedGhs),
          paymentMethod: newOrderForm.paymentMethod.trim() || undefined,
          deliveryStatus:
            newOrderForm.deliveryStatus.trim() === '' || newOrderForm.deliveryStatus === DELIVERY_STATUS_NONE
              ? undefined
              : newOrderForm.deliveryStatus.trim(),
          items: newOrderForm.items
            .map((it) => ({
              ...(it.sku.trim() ? { sku: it.sku.trim() } : {}),
              name: it.name.trim(),
              qty: Number.parseInt(it.qty, 10),
              unitPrice: Number.parseFloat(it.unitPrice),
            }))
            .filter(
              (it) =>
                it.name &&
                Number.isFinite(it.qty) &&
                it.qty > 0 &&
                Number.isFinite(it.unitPrice) &&
                it.unitPrice >= 0,
            ),
          remarks: newOrderForm.remarks.trim() || undefined,
          additionalRemarks: newOrderForm.additionalRemarks.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not add order')
      toast.success('Order added')
      setNewOrderOpen(false)
      setNewOrderForm({
        date: todayLocalYmd(),
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
        deliveryStatus: DELIVERY_STATUS_NONE,
        remarks: '',
        additionalRemarks: '',
        items: [{ sku: '', name: '', qty: '1', unitPrice: '' }],
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add order')
    } finally {
      setNewOrderSubmitting(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const [ledgerRes, customersRes, ordersRes] = await Promise.all([
        fetch('/api/dtc/customer-intelligence', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/dtc/customers', { credentials: 'include', cache: 'no-store' }),
        // Include legacy Orders Engine orders (saved in dtc_orders) so searches match what you see elsewhere.
        mode === 'orders-engine'
          ? fetch('/api/dtc/orders', { credentials: 'include', cache: 'no-store' })
          : Promise.resolve(null as any),
      ])
      if (ledgerRes.status === 401 || customersRes.status === 401 || ordersRes?.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!ledgerRes.ok || !customersRes.ok) throw new Error('Failed to load customer intelligence')

      const ledgerJson = (await ledgerRes.json()) as { rows: CustomerIntelLedgerRow[] }
      const customersJson = (await customersRes.json()) as {
        customers: CustomerRow[]
        segments: SegmentCounts
      }
      const baseRows = Array.isArray(ledgerJson.rows) ? ledgerJson.rows : []

      // Merge in /api/dtc/orders (created earlier when this page was the Orders Engine).
      // These are shown as additional rows (deduped by orderNumber).
      let merged = baseRows
      if (mode === 'orders-engine' && ordersRes && ordersRes.ok) {
        try {
          const ordersJson = (await ordersRes.json()) as { orders?: OrdersEngineOrderRow[] }
          const orders = Array.isArray(ordersJson.orders) ? ordersJson.orders : []
          const toItemsOrdered = (items: OrdersEngineOrderRow['items']) =>
            (items ?? [])
              .map((it) => {
                const n = String(it?.name ?? '').trim()
                const q = Number(it?.qty ?? 0)
                if (!n) return ''
                return q > 1 ? `${n} x${q}` : n
              })
              .filter(Boolean)
              .join(', ')

          const fromOrders: CustomerIntelLedgerRow[] = orders.map((o) => ({
            id: `order:${o.id}`,
            orderedAt: o.orderedAt ?? null,
            orderNumber: o.orderNumber ?? '',
            itemsOrdered: toItemsOrdered(o.items),
            customerName: o.customer ?? '',
            phoneNumber: String(o.customerPhone ?? ''),
            location: String(o.customerLocation ?? ''),
            riderAssigned: '',
            amountToCollectGhs: Number(o.totalAmount ?? 0) || 0,
            cashCollectedGhs: 0,
            momoCollectedGhs: 0,
            paystackCollectedGhs: 0,
            totalCollectedGhs: Number(o.totalAmount ?? 0) || 0,
            paymentMethod: String(o.paymentMethod ?? ''),
            deliveryStatus: String(o.status ?? ''),
            remarks: '',
            additionalRemarks: '',
          }))

          const seen = new Set(baseRows.map((r) => (r.orderNumber ?? '').trim()).filter(Boolean))
          const add = fromOrders.filter((r) => {
            const k = (r.orderNumber ?? '').trim()
            if (!k) return true
            if (seen.has(k)) return false
            seen.add(k)
            return true
          })
          merged = [...baseRows, ...add]
        } catch {
          merged = baseRows
        }
      }

      setLedgerRows(merged)
      setCustomers(customersJson.customers)
      setSegments(customersJson.segments)
    } catch {
      toast.error('Could not load customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const displayRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const { fromTs, toTs } = computeRangeTs(rangePreset, rangeFrom, rangeTo)
    const base = ledgerRows.filter((r) => {
      const okSearch = !q
        ? true
        : [
            r.customerName,
            r.phoneNumber,
            r.location,
            r.riderAssigned,
            r.orderNumber,
            r.paymentMethod,
            r.deliveryStatus,
            r.remarks,
            r.additionalRemarks,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)
      if (!okSearch) return false

      if (!fromTs && !toTs) return true
      const t = r.orderedAt ? new Date(r.orderedAt).getTime() : NaN
      if (!Number.isFinite(t)) return false
      if (fromTs != null && t < fromTs) return false
      if (toTs != null && t > toTs) return false
      return true
    })

    base.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.customerName.localeCompare(b.customerName)
        case 'amountToCollect':
          return (b.amountToCollectGhs ?? 0) - (a.amountToCollectGhs ?? 0)
        case 'totalCollected':
          return (b.totalCollectedGhs ?? 0) - (a.totalCollectedGhs ?? 0)
        case 'date':
        default: {
          const ta = a.orderedAt ? new Date(a.orderedAt).getTime() : 0
          const tb = b.orderedAt ? new Date(b.orderedAt).getTime() : 0
          return tb - ta
        }
      }
    })

    return base
  }, [ledgerRows, query, rangeFrom, rangePreset, rangeTo, sortBy])

  const totals = useMemo(() => {
    const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '').trim()
    const uniqueCustomerKeys = new Set(
      ledgerRows.map((r) => {
        const p = normalizePhone(r.phoneNumber ?? '')
        // Unique identifier is phone number; if missing, fall back to name so blanks don't collapse.
        return p ? `p:${p}` : `n:${String(r.customerName ?? '').trim().toLowerCase()}`
      }),
    )
    const totalCustomers = uniqueCustomerKeys.size
    const totalOrders = customers.reduce((sum, c) => sum + (Number.isFinite(c.totalOrders) ? c.totalOrders : 0), 0)
    const totalBilled = customers.reduce((sum, c) => sum + c.totalBilled, 0)
    const avgTotalBilled = totalCustomers === 0 ? 0 : totalBilled / totalCustomers
    return { totalCustomers, totalOrders, totalBilled, avgTotalBilled }
  }, [customers, ledgerRows])

  const displayCustomers = useMemo(() => {
    const q = query.trim().toLowerCase()
    const { fromTs, toTs } = computeRangeTs(rangePreset, rangeFrom, rangeTo)

    const ymdToMs = (ymd: string) => {
      const v = String(ymd ?? '').trim()
      if (!v) return NaN
      const d = new Date(`${v}T12:00:00.000Z`)
      return Number.isNaN(d.getTime()) ? NaN : d.getTime()
    }

    const base = customers.filter((c) => {
      const okSearch = !q
        ? true
        : [
            c.customerName,
            c.phoneNumber,
            c.location,
            c.segment,
            c.computedSegment,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)
      if (!okSearch) return false

      if (!fromTs && !toTs) return true
      const t = ymdToMs(c.lastOrderDate)
      if (!Number.isFinite(t)) return false
      if (fromTs != null && t < fromTs) return false
      if (toTs != null && t > toTs) return false
      return true
    })

    base.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.customerName.localeCompare(b.customerName)
        case 'amountToCollect':
          return (b.totalBilled ?? 0) - (a.totalBilled ?? 0)
        case 'totalCollected':
          return (b.totalCollected ?? 0) - (a.totalCollected ?? 0)
        case 'date':
        default: {
          const ta = ymdToMs(a.lastOrderDate)
          const tb = ymdToMs(b.lastOrderDate)
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
        }
      }
    })

    return base
  }, [customers, query, rangeFrom, rangePreset, rangeTo, sortBy])

  const ordersEngineCards = useMemo(() => {
    const { fromTs, toTs } = computeRangeTs(rangePreset, rangeFrom, rangeTo)
    const rowsForCards =
      mode !== 'orders-engine' || (!fromTs && !toTs)
        ? ledgerRows
        : ledgerRows.filter((r) => {
            const t = r.orderedAt ? new Date(r.orderedAt).getTime() : NaN
            if (!Number.isFinite(t)) return false
            if (fromTs != null && t < fromTs) return false
            if (toTs != null && t > toTs) return false
            return true
          })

    const normalizePhone = (p: string) => p.replace(/[^\d+]/g, '').trim()
    const uniqueCustomerKeys = new Set(
      rowsForCards.map((r) => {
        const p = normalizePhone(r.phoneNumber ?? '')
        return p ? `p:${p}` : `n:${String(r.customerName ?? '').trim().toLowerCase()}`
      }),
    )
    const totalOrders = rowsForCards.length
    const totalBilled = rowsForCards.reduce((s, r) => s + (Number(r.amountToCollectGhs ?? 0) || 0), 0)
    const totalCollected = rowsForCards.reduce((s, r) => s + (Number(r.totalCollectedGhs ?? 0) || 0), 0)
    const isReturnedish = (s: string) => {
      const t = s.trim().toLowerCase()
      return t.includes('returned') || t.includes('return')
    }
    const returnedCount = rowsForCards.reduce((s, r) => {
      const hit =
        isReturnedish(String(r.deliveryStatus ?? '')) ||
        isReturnedish(String(r.remarks ?? '')) ||
        isReturnedish(String(r.additionalRemarks ?? ''))
      return s + (hit ? 1 : 0)
    }, 0)
    return {
      uniqueCustomers: uniqueCustomerKeys.size,
      totalOrders,
      totalBilled,
      totalCollected,
      returnedCount,
    }
  }, [ledgerRows, mode, rangeFrom, rangePreset, rangeTo])

  function handleExport() {
    if (ledgerRows.length === 0) {
      toast.message('No rows to export yet')
      return
    }
    const header = [
      '#',
      'Date',
      'Order #',
      'Customer Name',
      'Phone Number',
      'Location',
      'Rider Assigned',
      'Amount to Collect (GHC)',
      'Cash Collected (GHC)',
      'MoMo Collected (GHC)',
      'Paystack Collected (GHC)',
      'Total Collected (GHC)',
      'Payment Method',
      'Delivery Status',
      'Remarks',
      'Additional Remarks',
    ]
    const lines = [
      header.join(','),
      ...ledgerRows.map((r, i) =>
        [
          i + 1,
          r.orderedAt ? r.orderedAt.slice(0, 10) : '',
          `"${(r.orderNumber ?? '').replace(/"/g, '""')}"`,
          `"${(r.customerName ?? '').replace(/"/g, '""')}"`,
          `"${(r.phoneNumber ?? '').replace(/"/g, '""')}"`,
          `"${(r.location ?? '').replace(/"/g, '""')}"`,
          `"${(r.riderAssigned ?? '').replace(/"/g, '""')}"`,
          r.amountToCollectGhs,
          r.cashCollectedGhs,
          r.momoCollectedGhs,
          r.paystackCollectedGhs,
          r.totalCollectedGhs,
          `"${(r.paymentMethod ?? '').replace(/"/g, '""')}"`,
          `"${(r.deliveryStatus ?? '').replace(/"/g, '""')}"`,
          `"${(r.remarks ?? '').replace(/"/g, '""')}"`,
          `"${(r.additionalRemarks ?? '').replace(/"/g, '""')}"`,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-customer-intelligence-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  function handleExportExcel() {
    if (ledgerRows.length === 0) {
      toast.message('No rows to export yet')
      return
    }

    const wb = XLSX.utils.book_new()

    const sheet = XLSX.utils.json_to_sheet(
      ledgerRows.map((r, i) => ({
        '#': i + 1,
        Date: r.orderedAt ? r.orderedAt.slice(0, 10) : '',
        'Order #': r.orderNumber,
        'Customer Name': r.customerName,
        'Phone Number': r.phoneNumber,
        Location: r.location,
        'Rider Assigned': r.riderAssigned,
        'Amount to Collect (GHC)': r.amountToCollectGhs,
        'Cash Collected (GHC)': r.cashCollectedGhs,
        'MoMo Collected (GHC)': r.momoCollectedGhs,
        'Paystack Collected (GHC)': r.paystackCollectedGhs,
        'Total Collected (GHC)': r.totalCollectedGhs,
        'Payment Method': r.paymentMethod,
        'Delivery Status': r.deliveryStatus,
        Remarks: r.remarks,
        'Additional Remarks': r.additionalRemarks,
      })),
    )
    XLSX.utils.book_append_sheet(wb, sheet, 'Customer Intelligence')

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-customer-intelligence-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel download started')
  }

  async function handleImportExcel(file: File) {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await fetch('/api/dtc/customer-intelligence/import-file', {
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
        ledgerRowCount?: number
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Import failed')
      }
      toast.success(`Imported ${Number(data.ledgerRowCount ?? 0).toLocaleString()} rows`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleResetCustomers() {
    const phrase = clearPhrase.trim()
    if (phrase !== CLEAR_DTC_CUSTOMERS_CONFIRM) {
      toast.error(`Type ${CLEAR_DTC_CUSTOMERS_CONFIRM} to confirm`)
      return
    }
    setClearing(true)
    try {
      const res = await fetch('/api/dtc/customer-intelligence/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CLEAR_DTC_CUSTOMERS_CONFIRM }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        deletedLedgerRows?: number
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not clear customers')
      }
      toast.success(`Cleared ${Number(data.deletedLedgerRows ?? 0).toLocaleString()} rows`)
      setClearOpen(false)
      setClearPhrase('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not clear customers')
    } finally {
      setClearing(false)
    }
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    const name = createForm.customerName.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/dtc/customer-intelligence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: createForm.date.trim() || undefined,
          orderNumber: createForm.orderNumber.trim() || undefined,
          itemsOrdered: createForm.itemsOrdered.trim() || undefined,
          customerName: name,
          phoneNumber: createForm.phoneNumber.trim() || undefined,
          location: createForm.location.trim() || undefined,
          riderAssigned: createForm.riderAssigned.trim() || undefined,
          amountToCollectGhs: createForm.amountToCollectGhs.trim() === '' ? 0 : Number(createForm.amountToCollectGhs),
          cashCollectedGhs: createForm.cashCollectedGhs.trim() === '' ? 0 : Number(createForm.cashCollectedGhs),
          momoCollectedGhs: createForm.momoCollectedGhs.trim() === '' ? 0 : Number(createForm.momoCollectedGhs),
          paystackCollectedGhs: createForm.paystackCollectedGhs.trim() === '' ? 0 : Number(createForm.paystackCollectedGhs),
          totalCollectedGhs: createForm.totalCollectedGhs.trim() === '' ? 0 : Number(createForm.totalCollectedGhs),
          paymentMethod: createForm.paymentMethod.trim() || undefined,
          deliveryStatus: createForm.deliveryStatus.trim() || undefined,
          remarks: createForm.remarks.trim() || undefined,
          additionalRemarks: createForm.additionalRemarks.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not add row')
      toast.success('Row added')
      setCreateOpen(false)
      setCreateForm({
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
      toast.error(err instanceof Error ? err.message : 'Failed to add row')
    } finally {
      setCreating(false)
    }
  }

  function openEditRow(r: CustomerIntelLedgerRow) {
    setEditRow(r)
    setEditForm({
      date: r.orderedAt ? r.orderedAt.slice(0, 10) : '',
      orderNumber: r.orderNumber ?? '',
      itemsOrdered: r.itemsOrdered ?? '',
      customerName: r.customerName ?? '',
      phoneNumber: r.phoneNumber ?? '',
      location: r.location ?? '',
      riderAssigned: r.riderAssigned ?? '',
      amountToCollectGhs: String(r.amountToCollectGhs ?? 0),
      cashCollectedGhs: String(r.cashCollectedGhs ?? 0),
      momoCollectedGhs: String(r.momoCollectedGhs ?? 0),
      paystackCollectedGhs: String(r.paystackCollectedGhs ?? 0),
      totalCollectedGhs: String(r.totalCollectedGhs ?? 0),
      paymentMethod: r.paymentMethod ?? '',
      deliveryStatus: r.deliveryStatus ?? '',
      remarks: r.remarks ?? '',
      additionalRemarks: r.additionalRemarks ?? '',
      items:
        r.items && Array.isArray(r.items) && r.items.length
          ? r.items.map((it) => ({
              sku: String(it.sku ?? ''),
              name: String(it.name ?? ''),
              qty: String(it.qty ?? 1),
              unitPrice: String(it.unitPrice ?? ''),
            }))
          : parseItemsOrderedToDraftItems(r.itemsOrdered ?? ''),
    })
    setEditOpen(true)
  }

  async function submitEditRow(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    const name = editForm.customerName.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }
    setEditingRow(true)
    try {
      const computedItemsOrdered = draftItemsToItemsOrdered(editForm.items)
      const res = await fetch(`/api/dtc/customer-intelligence/${editRow.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editForm.date.trim() || undefined,
          orderNumber: editForm.orderNumber.trim() || undefined,
          itemsOrdered: (editForm.itemsOrdered.trim() || computedItemsOrdered || undefined),
          items: editForm.items
            .map((it) => ({
              ...(it.sku.trim() ? { sku: it.sku.trim() } : {}),
              name: it.name.trim(),
              qty: Number.parseInt(it.qty, 10),
              unitPrice: Number.parseFloat(it.unitPrice),
            }))
            .filter(
              (it) =>
                it.name &&
                Number.isFinite(it.qty) &&
                it.qty > 0 &&
                Number.isFinite(it.unitPrice) &&
                it.unitPrice >= 0,
            ),
          customerName: name,
          phoneNumber: editForm.phoneNumber.trim() || undefined,
          location: editForm.location.trim() || undefined,
          riderAssigned: editForm.riderAssigned.trim() || undefined,
          amountToCollectGhs:
            editForm.amountToCollectGhs.trim() === '' ? undefined : Number(editForm.amountToCollectGhs),
          cashCollectedGhs:
            editForm.cashCollectedGhs.trim() === '' ? undefined : Number(editForm.cashCollectedGhs),
          momoCollectedGhs:
            editForm.momoCollectedGhs.trim() === '' ? undefined : Number(editForm.momoCollectedGhs),
          paystackCollectedGhs:
            editForm.paystackCollectedGhs.trim() === ''
              ? undefined
              : Number(editForm.paystackCollectedGhs),
          totalCollectedGhs:
            editForm.totalCollectedGhs.trim() === '' ? undefined : Number(editForm.totalCollectedGhs),
          paymentMethod: editForm.paymentMethod.trim() || undefined,
          deliveryStatus: editForm.deliveryStatus.trim() || undefined,
          remarks: editForm.remarks.trim() || undefined,
          additionalRemarks: editForm.additionalRemarks.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not save row')
      toast.success('Row updated')
      setEditOpen(false)
      setEditRow(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save row')
    } finally {
      setEditingRow(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title={mode === 'orders-engine' ? 'Orders Engine' : 'Customer Intelligence'}
        description={
          mode === 'orders-engine'
            ? 'Add and manage sell-out orders using the Customer Intelligence headers (one row = one order).'
            : 'Customer list with totals from your sheet and from sell-out orders. Columns include name, phone, orders, billed, collected, location, returns, and first/last order dates.'
        }
        actions={
          <>
            {mode === 'orders-engine' ? (
              <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5" type="button">
                    <Plus className="h-4 w-4" />
                    Add order
                  </Button>
                </DialogTrigger>
              <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
                <form onSubmit={submitNewOrder} className="flex min-h-0 flex-1 flex-col">
                  <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
                    <DialogTitle>Add order</DialogTitle>
                    <DialogDescription>Add an order row using the Customer Intelligence headers.</DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    <div className="grid gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-date">Date</Label>
                          <Input id="oe-add-date" type="date" value={newOrderForm.date} onChange={(e) => setNewOrderForm((f) => ({ ...f, date: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-orderno">Order #</Label>
                          <Input id="oe-add-orderno" value={newOrderForm.orderNumber} onChange={(e) => setNewOrderForm((f) => ({ ...f, orderNumber: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-add-customer">Customer Name</Label>
                          <DtcOrderCustomerField
                            id="oe-add-customer"
                            value={newOrderForm.customerName}
                            onChange={(customerName) => setNewOrderForm((f) => ({ ...f, customerName }))}
                            onPickCustomer={(hit) => setNewOrderForm((f) => ({ ...f, ...customerSearchToFormFields(hit) }))}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-phone">Phone Number</Label>
                          <Input id="oe-add-phone" value={newOrderForm.phoneNumber} onChange={(e) => setNewOrderForm((f) => ({ ...f, phoneNumber: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-location">Location</Label>
                          <Input id="oe-add-location" value={newOrderForm.location} onChange={(e) => setNewOrderForm((f) => ({ ...f, location: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-rider">Rider Assigned</Label>
                          <Input id="oe-add-rider" value={newOrderForm.riderAssigned} onChange={(e) => setNewOrderForm((f) => ({ ...f, riderAssigned: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-amt">Amount to Collect (GHC)</Label>
                          <Input id="oe-add-amt" type="number" min={0} step="0.01" value={newOrderForm.amountToCollectGhs} onChange={(e) => setNewOrderForm((f) => ({ ...f, amountToCollectGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-cash">Cash Collected (GHC)</Label>
                          <Input id="oe-add-cash" type="number" min={0} step="0.01" value={newOrderForm.cashCollectedGhs} onChange={(e) => setNewOrderForm((f) => ({ ...f, cashCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-momo">MoMo Collected (GHC)</Label>
                          <Input id="oe-add-momo" type="number" min={0} step="0.01" value={newOrderForm.momoCollectedGhs} onChange={(e) => setNewOrderForm((f) => ({ ...f, momoCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-paystack">Paystack Collected (GHC)</Label>
                          <Input id="oe-add-paystack" type="number" min={0} step="0.01" value={newOrderForm.paystackCollectedGhs} onChange={(e) => setNewOrderForm((f) => ({ ...f, paystackCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-add-total">Total Collected (GHC)</Label>
                          <Input id="oe-add-total" type="number" min={0} step="0.01" value={newOrderForm.totalCollectedGhs} onChange={(e) => setNewOrderForm((f) => ({ ...f, totalCollectedGhs: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-paymethod">Payment Method</Label>
                          <Input id="oe-add-paymethod" value={newOrderForm.paymentMethod} onChange={(e) => setNewOrderForm((f) => ({ ...f, paymentMethod: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="oe-add-status">Delivery Status</Label>
                          <Select
                            value={newOrderForm.deliveryStatus}
                            onValueChange={(v) => setNewOrderForm((f) => ({ ...f, deliveryStatus: v }))}
                          >
                            <SelectTrigger id="oe-add-status" className="w-full justify-between">
                              <SelectValue placeholder="Not set" />
                            </SelectTrigger>
                            <SelectContent>
                              {DELIVERY_STATUS_OPTIONS.map((o) => (
                                <SelectItem key={o.value || 'blank'} value={o.value}>
                                  <span className="flex items-center gap-2">
                                    {deliveryStatusBadge(o.value)}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-add-remarks">Remarks</Label>
                          <Input id="oe-add-remarks" value={newOrderForm.remarks} onChange={(e) => setNewOrderForm((f) => ({ ...f, remarks: e.target.value }))} />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oe-add-additional">Additional Remarks</Label>
                          <Input id="oe-add-additional" value={newOrderForm.additionalRemarks} onChange={(e) => setNewOrderForm((f) => ({ ...f, additionalRemarks: e.target.value }))} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Order items</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setNewOrderForm((f) => ({
                                ...f,
                                items: [...f.items, { sku: '', name: '', qty: '1', unitPrice: '' }],
                              }))
                            }
                          >
                            Add item
                          </Button>
                        </div>
                        <div className="space-y-3">
                          {newOrderForm.items.map((it, idx) => (
                            <div key={idx} className="rounded-lg border border-border p-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-2">
                                  <Label htmlFor={`oe-item-name-${idx}`}>Item name</Label>
                                  <Input
                                    id={`oe-item-name-${idx}`}
                                    value={it.name}
                                    onChange={(e) =>
                                      setNewOrderForm((f) => {
                                        const items = [...f.items]
                                        items[idx] = { ...items[idx], name: e.target.value }
                                        return { ...f, items }
                                      })
                                    }
                                    placeholder="Gelos Charcoal Toothpaste"
                                    required={idx === 0}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`oe-item-sku-${idx}`}>SKU (optional)</Label>
                                  <Input
                                    id={`oe-item-sku-${idx}`}
                                    value={it.sku}
                                    onChange={(e) =>
                                      setNewOrderForm((f) => {
                                        const items = [...f.items]
                                        items[idx] = { ...items[idx], sku: e.target.value }
                                        return { ...f, items }
                                      })
                                    }
                                    placeholder="GLO-CHAR-100"
                                  />
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <div className="space-y-2">
                                  <Label htmlFor={`oe-item-qty-${idx}`}>Qty</Label>
                                  <Input
                                    id={`oe-item-qty-${idx}`}
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    step={1}
                                    value={it.qty}
                                    onChange={(e) =>
                                      setNewOrderForm((f) => {
                                        const items = [...f.items]
                                        items[idx] = { ...items[idx], qty: e.target.value }
                                        return { ...f, items }
                                      })
                                    }
                                    required={idx === 0}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor={`oe-item-unit-${idx}`}>Unit price (GHS)</Label>
                                  <Input
                                    id={`oe-item-unit-${idx}`}
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="0.01"
                                    value={it.unitPrice}
                                    onChange={(e) =>
                                      setNewOrderForm((f) => {
                                        const items = [...f.items]
                                        items[idx] = { ...items[idx], unitPrice: e.target.value }
                                        return { ...f, items }
                                      })
                                    }
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
                                      setNewOrderForm((f) => ({
                                        ...f,
                                        items: f.items.filter((_, i2) => i2 !== idx),
                                      }))
                                    }
                                    disabled={newOrderForm.items.length === 1}
                                    aria-label="Remove item"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">
                    <Button type="button" variant="outline" onClick={() => setNewOrderOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={newOrderSubmitting}>
                      {newOrderSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        'Add order'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
              </Dialog>
            ) : null}

            {mode === 'customer-intelligence' ? (
              <Button size="sm" className="gap-1.5" type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add customer
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleExport}
              disabled={loading || customers.length === 0}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleExportExcel}
              disabled={loading || customers.length === 0}
            >
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
          </>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {mode === 'orders-engine' ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-teal-600 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total orders
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {loading ? '—' : ordersEngineCards.totalOrders.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? '—' : `${ordersEngineCards.uniqueCustomers.toLocaleString()} unique customers (by phone)`}
              </p>
            </Card>
            <Card className="border-l-4 border-l-cyan-600 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total billed
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {loading ? '—' : formatGhs(ordersEngineCards.totalBilled)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Sum of Amount to Collect</p>
            </Card>
            <Card className="border-l-4 border-l-sky-600 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Total collected
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {loading ? '—' : formatGhs(ordersEngineCards.totalCollected)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Sum of Total Collected</p>
            </Card>
            <Card className="border-l-4 border-l-slate-600 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Returned
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">
                {loading ? '—' : (ordersEngineCards.returnedCount ? ordersEngineCards.returnedCount.toLocaleString() : '—')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Count of returned rows</p>
            </Card>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Customers tracked
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : totals.totalCustomers.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Unique customer names</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Avg total billed
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : formatGhs(totals.avgTotalBilled)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Per customer (sheet or orders)</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-indigo-600">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                High billed
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : segments?.highLtv ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Billed ≥ GHS 2,000 or 10+ orders</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-red-600">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                At risk
              </p>
              <p className="mt-2 text-2xl font-bold">
                {loading ? '—' : segments?.atRisk ?? 0}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">No order in 60+ days</p>
            </Card>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md flex-1 space-y-2">
            <Label htmlFor="customer-search" className="text-muted-foreground">
              Search customers
            </Label>
            <Input
              id="customer-search"
              placeholder="Customer name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:justify-end">
            <div className="flex w-full flex-col gap-2 sm:w-auto">
              <Label className="text-muted-foreground">Date range</Label>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full sm:w-[200px]">
                  <Select value={rangePreset} onValueChange={(v) => setRangePreset(v as RangePreset)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="1m">Last 1 month</SelectItem>
                      <SelectItem value="3m">Last 3 months</SelectItem>
                      <SelectItem value="6m">Last 6 months</SelectItem>
                      <SelectItem value="12m">Last 12 months</SelectItem>
                      <SelectItem value="custom">Custom…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {rangePreset === 'custom' ? (
                  <>
                    <Input
                      type="date"
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(e.target.value)}
                      className="w-[10.5rem]"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={rangeTo}
                      onChange={(e) => setRangeTo(e.target.value)}
                      className="w-[10.5rem]"
                    />
                  </>
                ) : null}

                {(rangePreset !== 'all' || rangeFrom || rangeTo) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRangePreset('all')
                      setRangeFrom('')
                      setRangeTo('')
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
            <div className="w-full min-w-[10rem] space-y-2 sm:w-44">
              <Label htmlFor="customer-sort" className="text-muted-foreground">
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as CustomerSortKey)}>
                <SelectTrigger id="customer-sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date (recent first)</SelectItem>
                  <SelectItem value="amountToCollect">Amount to collect (high first)</SelectItem>
                  <SelectItem value="totalCollected">Total collected (high first)</SelectItem>
                  <SelectItem value="name">Customer name (A–Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {query ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')}>
                Clear search
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {mode === 'orders-engine' ? 'Orders list' : 'Customer list'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={load}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading customers…
            </div>
          ) : (mode === 'orders-engine' ? displayRows.length === 0 : displayCustomers.length === 0) ? (
            <div className="p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {customers.length === 0 ? 'No customers yet' : 'No matches'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {customers.length === 0
                      ? 'Use Add customer to create a record, or wait until customer data is available. Sell-out orders stay in Orders.'
                      : 'Try a different search term.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
            {mode === 'orders-engine' ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 min-w-10 text-right tabular-nums text-muted-foreground">#</TableHead>
                    <TableHead className="whitespace-nowrap">Date</TableHead>
                    <TableHead className="whitespace-nowrap">Orders (count)</TableHead>
                    <TableHead className="min-w-[10rem] whitespace-nowrap">Customer Name</TableHead>
                    <TableHead className="min-w-[7rem] whitespace-nowrap">Phone Number</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">Location</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">Rider Assigned</TableHead>
                    <TableHead className="min-w-[12rem] whitespace-nowrap">Items ordered</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Amount to Collect (GHC)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Cash Collected (GHC)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">MoMo Collected (GHC)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Paystack Collected (GHC)</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total Collected (GHC)</TableHead>
                    <TableHead className="whitespace-nowrap">Payment Method</TableHead>
                    <TableHead className="whitespace-nowrap">Delivery Status</TableHead>
                    <TableHead className="min-w-[12rem] whitespace-nowrap">Remarks</TableHead>
                    <TableHead className="min-w-[12rem] whitespace-nowrap">Additional Remarks</TableHead>
                    <TableHead className="w-[64px] text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((c, i) => {
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-right text-muted-foreground tabular-nums text-sm">
                          {i + 1}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.orderedAt ? fmtTableDate(c.orderedAt.slice(0, 10)) : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                          1
                        </TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{c.customerName}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                          {c.phoneNumber || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.location || '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.riderAssigned || '—'}
                        </TableCell>
                        <TableCell className="max-w-[18rem] truncate text-muted-foreground" title={c.itemsOrdered}>
                          {c.itemsOrdered || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {formatGhs(c.amountToCollectGhs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {formatGhs(c.cashCollectedGhs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {formatGhs(c.momoCollectedGhs)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {formatGhs(c.paystackCollectedGhs)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                          {formatGhs(c.totalCollectedGhs)}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.paymentMethod || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{deliveryStatusBadge(c.deliveryStatus)}</TableCell>
                        <TableCell className="max-w-[18rem] truncate text-muted-foreground" title={c.remarks}>
                          {c.remarks || '—'}
                        </TableCell>
                        <TableCell
                          className="max-w-[18rem] truncate text-muted-foreground"
                          title={c.additionalRemarks}
                        >
                          {c.additionalRemarks || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditRow(c)}
                            aria-label="Edit row"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 min-w-10 text-right tabular-nums text-muted-foreground">#</TableHead>
                    <TableHead className="min-w-[10rem] whitespace-nowrap">Customer Name</TableHead>
                    <TableHead className="min-w-[7rem] whitespace-nowrap">Phone Number</TableHead>
                    <TableHead className="min-w-[8rem] whitespace-nowrap">Location</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Orders</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total billed</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total collected</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Returned</TableHead>
                    <TableHead className="whitespace-nowrap">First order</TableHead>
                    <TableHead className="whitespace-nowrap">Last order</TableHead>
                    <TableHead className="whitespace-nowrap">Segment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayCustomers.map((c, i) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-right text-muted-foreground tabular-nums text-sm">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{c.customerName}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {c.phoneNumber || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.location || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {Number(c.totalOrders ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(Number(c.totalBilled ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(Number(c.totalCollected ?? 0))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {Number(c.returned ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.firstOrderDate ? fmtTableDate(c.firstOrderDate) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.lastOrderDate ? fmtTableDate(c.lastOrderDate) : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge variant="outline" className="font-normal">
                          {c.segment || c.computedSegment}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            </div>
          )}
        </Card>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setEditRow(null)
        }}
      >
        <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <form onSubmit={submitEditRow} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
              <DialogTitle>Edit row</DialogTitle>
              <DialogDescription>Updates the Customer Intelligence row.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-date">Date</Label>
                  <Input
                    id="ci-edit-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-order">Order #</Label>
                  <Input
                    id="ci-edit-order"
                    value={editForm.orderNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, orderNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-items">Items ordered</Label>
                  <Input
                    id="ci-edit-items"
                    value={editForm.itemsOrdered}
                    onChange={(e) => setEditForm((f) => ({ ...f, itemsOrdered: e.target.value }))}
                    placeholder="e.g. Toothpaste, Mouthwash"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
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
                  <p className="text-xs text-muted-foreground">
                    If “Items ordered” is empty, we auto-fill it from these items.
                  </p>
                  <div className="space-y-3">
                    {editForm.items.map((it, idx) => (
                      <div key={idx} className="rounded-lg border border-border p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`ci-edit-item-name-${idx}`}>Item name</Label>
                            <Input
                              id={`ci-edit-item-name-${idx}`}
                              value={it.name}
                              onChange={(e) =>
                                setEditForm((f) => {
                                  const items = [...f.items]
                                  items[idx] = { ...items[idx], name: e.target.value }
                                  return { ...f, items }
                                })
                              }
                              placeholder="Gelos Charcoal Toothpaste"
                              required={idx === 0}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`ci-edit-item-sku-${idx}`}>SKU (optional)</Label>
                            <Input
                              id={`ci-edit-item-sku-${idx}`}
                              value={it.sku}
                              onChange={(e) =>
                                setEditForm((f) => {
                                  const items = [...f.items]
                                  items[idx] = { ...items[idx], sku: e.target.value }
                                  return { ...f, items }
                                })
                              }
                              placeholder="GLO-CHAR-100"
                            />
                          </div>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2">
                            <Label htmlFor={`ci-edit-item-qty-${idx}`}>Qty</Label>
                            <Input
                              id={`ci-edit-item-qty-${idx}`}
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
                            <Label htmlFor={`ci-edit-item-unit-${idx}`}>Unit price (GHS)</Label>
                            <Input
                              id={`ci-edit-item-unit-${idx}`}
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
                                  items: f.items.filter((_, i2) => i2 !== idx),
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
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-name">Customer Name</Label>
                  <Input
                    id="ci-edit-name"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm((f) => ({ ...f, customerName: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-phone">Phone Number</Label>
                  <Input
                    id="ci-edit-phone"
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-location">Location</Label>
                  <Input
                    id="ci-edit-location"
                    value={editForm.location}
                    onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-rider">Rider Assigned</Label>
                  <Input
                    id="ci-edit-rider"
                    value={editForm.riderAssigned}
                    onChange={(e) => setEditForm((f) => ({ ...f, riderAssigned: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-paymethod">Payment Method</Label>
                  <Input
                    id="ci-edit-paymethod"
                    value={editForm.paymentMethod}
                    onChange={(e) => setEditForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-status">Delivery Status</Label>
                  <Input
                    id="ci-edit-status"
                    value={editForm.deliveryStatus}
                    onChange={(e) => setEditForm((f) => ({ ...f, deliveryStatus: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-amt">Amount to Collect (GHC)</Label>
                  <Input
                    id="ci-edit-amt"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.amountToCollectGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, amountToCollectGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-cash">Cash Collected (GHC)</Label>
                  <Input
                    id="ci-edit-cash"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.cashCollectedGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, cashCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-momo">MoMo Collected (GHC)</Label>
                  <Input
                    id="ci-edit-momo"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.momoCollectedGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, momoCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-paystack">Paystack Collected (GHC)</Label>
                  <Input
                    id="ci-edit-paystack"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.paystackCollectedGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, paystackCollectedGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-total">Total Collected (GHC)</Label>
                  <Input
                    id="ci-edit-total"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.totalCollectedGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, totalCollectedGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-remarks">Remarks</Label>
                  <Input
                    id="ci-edit-remarks"
                    value={editForm.remarks}
                    onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-additional">Additional Remarks</Label>
                  <Input
                    id="ci-edit-additional"
                    value={editForm.additionalRemarks}
                    onChange={(e) => setEditForm((f) => ({ ...f, additionalRemarks: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={editingRow}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editingRow}>
                {editingRow ? (
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleCreateCustomer}>
            <DialogHeader>
              <DialogTitle>Add customer</DialogTitle>
              <DialogDescription>
                Add a Customer Intelligence row (same columns and order as the table).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ci-create-date">Date</Label>
                  <Input
                    id="ci-create-date"
                    type="date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-order">Order #</Label>
                  <Input
                    id="ci-create-order"
                    value={createForm.orderNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, orderNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-create-items">Items ordered</Label>
                  <Input
                    id="ci-create-items"
                    value={createForm.itemsOrdered}
                    onChange={(e) => setCreateForm((f) => ({ ...f, itemsOrdered: e.target.value }))}
                    placeholder="e.g. Toothpaste, Mouthwash"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-create-name">Customer Name</Label>
                  <Input
                    id="ci-create-name"
                    value={createForm.customerName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, customerName: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-phone">Phone Number</Label>
                  <Input
                    id="ci-create-phone"
                    value={createForm.phoneNumber}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                    inputMode="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-location">Location</Label>
                  <Input
                    id="ci-create-location"
                    value={createForm.location}
                    onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-rider">Rider Assigned</Label>
                  <Input
                    id="ci-create-rider"
                    value={createForm.riderAssigned}
                    onChange={(e) => setCreateForm((f) => ({ ...f, riderAssigned: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-amt">Amount to Collect (GHC)</Label>
                  <Input
                    id="ci-create-amt"
                    type="number"
                    min={0}
                    step="0.01"
                    value={createForm.amountToCollectGhs}
                    onChange={(e) => setCreateForm((f) => ({ ...f, amountToCollectGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-cash">Cash Collected (GHC)</Label>
                  <Input
                    id="ci-create-cash"
                    type="number"
                    min={0}
                    step="0.01"
                    value={createForm.cashCollectedGhs}
                    onChange={(e) => setCreateForm((f) => ({ ...f, cashCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-momo">MoMo Collected (GHC)</Label>
                  <Input
                    id="ci-create-momo"
                    type="number"
                    min={0}
                    step="0.01"
                    value={createForm.momoCollectedGhs}
                    onChange={(e) => setCreateForm((f) => ({ ...f, momoCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-paystack">Paystack Collected (GHC)</Label>
                  <Input
                    id="ci-create-paystack"
                    type="number"
                    min={0}
                    step="0.01"
                    value={createForm.paystackCollectedGhs}
                    onChange={(e) => setCreateForm((f) => ({ ...f, paystackCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-create-total">Total Collected (GHC)</Label>
                  <Input
                    id="ci-create-total"
                    type="number"
                    min={0}
                    step="0.01"
                    value={createForm.totalCollectedGhs}
                    onChange={(e) => setCreateForm((f) => ({ ...f, totalCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-paymethod">Payment Method</Label>
                  <Input
                    id="ci-create-paymethod"
                    value={createForm.paymentMethod}
                    onChange={(e) => setCreateForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-create-status">Delivery Status</Label>
                  <Input
                    id="ci-create-status"
                    value={createForm.deliveryStatus}
                    onChange={(e) => setCreateForm((f) => ({ ...f, deliveryStatus: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-create-remarks">Remarks</Label>
                  <Input
                    id="ci-create-remarks"
                    value={createForm.remarks}
                    onChange={(e) => setCreateForm((f) => ({ ...f, remarks: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-create-additional">Additional Remarks</Label>
                  <Input
                    id="ci-create-additional"
                    value={createForm.additionalRemarks}
                    onChange={(e) => setCreateForm((f) => ({ ...f, additionalRemarks: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? (
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
    </div>
  )
}

