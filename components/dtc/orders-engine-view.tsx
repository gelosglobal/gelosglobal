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

function customerSearchToFormFields(hit: DtcOrderCustomerSearchHit) {
  return {
    customer: hit.customerName,
    customerPhone: hit.phoneNumber,
    customerEmail: hit.email,
    customerLocation: hit.location,
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

export function OrdersEngineView() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [intelAgg, setIntelAgg] = useState<CustomerIntelAgg | null>(null)
  const [sheetCustomers, setSheetCustomers] = useState<DtcOrdersEngineCustomerJson[]>([])
  const [loading, setLoading] = useState(true)
  const [importingCustomers, setImportingCustomers] = useState(false)
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState<OrdersSortKey>('newest')
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
      const [ordersRes, sheetRes] = await Promise.all([
        fetch('/api/dtc/orders', { credentials: 'include' }),
        fetch('/api/dtc/orders-engine/customers', { credentials: 'include', cache: 'no-store' }),
      ])
      if (ordersRes.status === 401 || sheetRes.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!ordersRes.ok) {
        throw new Error('Failed to load orders')
      }
      const orderData = (await ordersRes.json()) as { orders: OrderRow[] }
      setOrders(orderData.orders)

      if (sheetRes.ok) {
        const json = (await sheetRes.json()) as { customers?: DtcOrdersEngineCustomerJson[] }
        const rows = Array.isArray(json.customers) ? json.customers : []
        setSheetCustomers(rows)
        setIntelAgg(aggregateCustomerIntel(rows))
      } else {
        setSheetCustomers([])
        setIntelAgg(null)
      }
    } catch {
      toast.error('Could not load orders')
      setSheetCustomers([])
      setIntelAgg(null)
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

  const filteredSheetCustomers = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const rows = (!q ? [...sheetCustomers] : sheetCustomers.filter((c) => {
      const hay = [
        c.customerName,
        c.phoneNumber,
        c.location,
        String(c.totalOrders ?? ''),
        String(c.totalBilledGhs ?? ''),
        String(c.totalCollectedGhs ?? ''),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }))

    rows.sort((a, b) => {
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

    return rows
  }, [filter, sheetCustomers, sortBy])

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
        title="Orders Engine"
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

            {/* Import button intentionally hidden per request */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New order
                </Button>
              </DialogTrigger>
              <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                <form
                  onSubmit={handleCreate}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
                    <DialogTitle>New DTC order</DialogTitle>
                    <DialogDescription>
                      Creates a sell-out order in the shared database (live for your team).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-h-0 min-w-0 flex-1 flex-basis-0 overflow-y-auto overflow-x-hidden px-6 py-4">
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer">Customer</Label>
                      <DtcOrderCustomerField
                        id="customer"
                        value={form.customer}
                        onChange={(customer) => setForm((f) => ({ ...f, customer }))}
                        onPickCustomer={(hit) =>
                          setForm((f) => ({ ...f, ...customerSearchToFormFields(hit) }))
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
                        <Label htmlFor="customer-phone">Phone</Label>
                        <Input
                          id="customer-phone"
                          value={form.customerPhone}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, customerPhone: e.target.value }))
                          }
                          placeholder="+233 …"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customer-email">Email</Label>
                        <Input
                          id="customer-email"
                          type="email"
                          value={form.customerEmail}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, customerEmail: e.target.value }))
                          }
                          placeholder="name@example.com"
                          autoComplete="email"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="customer-location">Location</Label>
                        <Input
                          id="customer-location"
                          value={form.customerLocation}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, customerLocation: e.target.value }))
                          }
                          placeholder="City or area"
                          autoComplete="street-address"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="orderedAt">Order date</Label>
                        <Input
                          id="orderedAt"
                          type="datetime-local"
                          value={form.orderedAt}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, orderedAt: e.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Payment method</Label>
                        <Select
                          value={form.paymentMethod}
                          onValueChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              paymentMethod: v as PaymentMethod,
                            }))
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
                        value={form.channel}
                        onValueChange={(v) =>
                          setForm((f) => ({
                            ...f,
                            channel: v as (typeof CHANNELS)[number],
                          }))
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
                            setForm((f) => ({
                              ...f,
                              items: [
                                ...f.items,
                                { sku: '', name: '', qty: '1', unitPrice: '' },
                              ],
                            }))
                          }
                        >
                          Add item
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {form.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-border p-3"
                          >
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`item-name-${idx}`}>Item name</Label>
                                <Input
                                  id={`item-name-${idx}`}
                                  value={it.name}
                                  onChange={(e) =>
                                    setForm((f) => {
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
                                <Label htmlFor={`item-sku-${idx}`}>SKU (optional)</Label>
                                <Input
                                  id={`item-sku-${idx}`}
                                  value={it.sku}
                                  onChange={(e) =>
                                    setForm((f) => {
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
                                <Label htmlFor={`item-qty-${idx}`}>Qty</Label>
                                <Input
                                  id={`item-qty-${idx}`}
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  step={1}
                                  value={it.qty}
                                  onChange={(e) =>
                                    setForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], qty: e.target.value }
                                      return { ...f, items }
                                    })
                                  }
                                  required={idx === 0}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`item-unit-${idx}`}>Unit price (GHS)</Label>
                                <Input
                                  id={`item-unit-${idx}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={it.unitPrice}
                                  onChange={(e) =>
                                    setForm((f) => {
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
                                    setForm((f) => ({
                                      ...f,
                                      items: f.items.filter((_, i) => i !== idx),
                                    }))
                                  }
                                  disabled={form.items.length === 1}
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
                          <Label htmlFor="order-discount">Discount (GHS)</Label>
                          <Input
                            id="order-discount"
                            inputMode="decimal"
                            value={form.discountGhs}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, discountGhs: e.target.value }))
                            }
                            placeholder="0.00"
                          />
                          <p className="text-xs text-muted-foreground">
                            Applied to the full order total.
                          </p>
                        </div>
                        <div className="rounded-lg bg-muted/30 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Subtotal</p>
                            <p className="text-xs font-medium tabular-nums text-foreground">
                              {formatGhs(computedSubtotal)}
                            </p>
                          </div>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">Discount</p>
                            <p className="text-xs font-medium tabular-nums text-foreground">
                              {computedDiscount > 0 ? `−${formatGhs(computedDiscount)}` : '—'}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                            <p className="text-sm font-medium text-foreground">Total</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">
                              {formatGhs(computedTotal)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, status: v as OrderStatus }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="pending_payment">
                            Pending payment
                          </SelectItem>
                          <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </div>
                  <DialogFooter className="shrink-0 gap-2 border-t bg-background px-6 py-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
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
              <p className="mt-1 text-xs text-muted-foreground">Across all customers</p>
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

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Customer sheet (imported)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              This table stays empty until you import an Excel file with the headers above.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : sheetCustomers.length === 0 ? (
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
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {Number(c.totalOrders ?? 0).toLocaleString()}
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

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Orders
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading orders…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {orders.length === 0
                ? 'No orders yet. Create one with New order.'
                : 'No matches for this search.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Channel</TableHead>
                  <TableHead className="hidden lg:table-cell">Payment</TableHead>
                  <TableHead className="hidden lg:table-cell">Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Order date</TableHead>
                  <TableHead className="w-[64px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {o.orderNumber}
                    </TableCell>
                    <TableCell>{o.customer}</TableCell>
                    <TableCell className="hidden sm:table-cell">{o.channel}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline">{o.paymentMethod.replace(/_/g, ' ')}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {o.items.length}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatGhs(o.totalAmount)}
                    </TableCell>
                    <TableCell>{orderStatusBadge(o.status)}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {format(new Date(o.orderedAt), 'dd MMM yyyy, HH:mm')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openViewOrder(o)}
                          aria-label="View order items"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditOrder(o)}
                          aria-label="Edit order"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void removeOrder(o)}
                          aria-label="Remove order"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
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
