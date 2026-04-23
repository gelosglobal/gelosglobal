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
import { DtcOrderCustomerField } from '@/components/dtc/dtc-order-customer-field'
import { formatGhs, type OrderStatus } from '@/lib/dtc-orders'

type OrderRow = {
  id: string
  orderNumber: string
  customer: string
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

type StatsPayload = {
  ordersToday: number
  avgOrderValue: number
  awaitingFulfillment: number
}

const CHANNELS = ['Web', 'Instagram', 'B2B portal', 'TikTok', 'Other'] as const
const PAYMENT_METHODS = [
  { value: 'momo', label: 'Mobile Money' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'pay_on_delivery', label: 'Pay on delivery' },
] as const

type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

type DraftItem = {
  sku: string
  name: string
  qty: string
  unitPrice: string
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
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewOrder, setViewOrder] = useState<OrderRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null)
  const [editForm, setEditForm] = useState({
    customer: '',
    channel: 'Web' as (typeof CHANNELS)[number],
    orderedAt: toDatetimeLocalValue(new Date()),
    paymentMethod: 'momo' as PaymentMethod,
    status: 'processing' as OrderStatus,
    discountGhs: '',
    items: [{ sku: '', name: '', qty: '1', unitPrice: '' } satisfies DraftItem],
  })
  const [form, setForm] = useState({
    customer: '',
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
      const res = await fetch('/api/dtc/orders', { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        throw new Error('Failed to load orders')
      }
      const data = (await res.json()) as {
        orders: OrderRow[]
        stats: StatsPayload
      }
      setOrders(data.orders)
      setStats(data.stats)
    } catch {
      toast.error('Could not load orders')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return orders
    return orders.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customer.toLowerCase().includes(q) ||
        o.channel.toLowerCase().includes(q),
    )
  }, [orders, filter])

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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New order
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl">
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>New DTC order</DialogTitle>
                    <DialogDescription>
                      Creates a sell-out order in the shared database (live for your team).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="customer">Customer</Label>
                      <DtcOrderCustomerField
                        id="customer"
                        value={form.customer}
                        onChange={(customer) => setForm((f) => ({ ...f, customer }))}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Search by name, phone, email, or location from Customer Intelligence, or type a
                        new name.
                      </p>
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
                  <DialogFooter>
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
              <DialogContent className="sm:max-w-3xl">
                <form onSubmit={handleEditSubmit}>
                  <DialogHeader>
                    <DialogTitle>Edit order</DialogTitle>
                    <DialogDescription>
                      Update customer, items, discount, and status. Totals are recalculated.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-customer">Customer</Label>
                      <DtcOrderCustomerField
                        id="edit-customer"
                        value={editForm.customer}
                        onChange={(customer) => setEditForm((f) => ({ ...f, customer }))}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Search by name, phone, email, or location from Customer Intelligence, or type a
                        new name.
                      </p>
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
                  <DialogFooter>
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
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
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

                {viewOrder ? (
                  <div className="space-y-4">
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

                <DialogFooter>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="max-w-md flex-1 space-y-2">
            <Label htmlFor="orders-search" className="text-muted-foreground">
              Search orders
            </Label>
            <Input
              id="orders-search"
              placeholder="Order #, customer, or channel…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {filter ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilter('')}>
              Clear
            </Button>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-violet-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Orders today
            </p>
            <p className="mt-2 text-3xl font-bold">
              {loading ? '—' : stats?.ordersToday ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Since midnight (local)</p>
          </Card>
          <Card className="border-l-4 border-l-blue-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Avg order value
            </p>
            <p className="mt-2 text-3xl font-bold">
              {loading
                ? '—'
                : formatGhs(stats?.avgOrderValue ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">All loaded orders</p>
          </Card>
          <Card className="border-l-4 border-l-amber-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Awaiting fulfillment
            </p>
            <p className="mt-2 text-3xl font-bold">
              {loading ? '—' : stats?.awaitingFulfillment ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Processing + pending payment</p>
          </Card>
        </div>

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
    </div>
  )
}
