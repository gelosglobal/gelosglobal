'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Download, Filter, Loader2, Plus, Trash2 } from 'lucide-react'
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
import { formatGhs, type OrderStatus } from '@/lib/dtc-orders'

type OrderRow = {
  id: string
  orderNumber: string
  customer: string
  channel: string
  paymentMethod: 'cash' | 'momo' | 'card' | 'bank_transfer' | 'pay_on_delivery'
  items: { sku?: string; name: string; qty: number; unitPrice: number }[]
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
  const [form, setForm] = useState({
    customer: '',
    channel: 'Web' as (typeof CHANNELS)[number],
    orderedAt: toDatetimeLocalValue(new Date()),
    paymentMethod: 'momo' as PaymentMethod,
    status: 'processing' as OrderStatus,
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

  const computedTotal = useMemo(() => {
    return form.items.reduce((sum, item) => {
      const qty = Number.parseInt(item.qty, 10)
      const unit = Number.parseFloat(item.unitPrice)
      if (!Number.isFinite(qty) || qty <= 0) return sum
      if (!Number.isFinite(unit) || unit <= 0) return sum
      return sum + qty * unit
    }, 0)
  }, [form.items])

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
        items: [{ sku: '', name: '', qty: '1', unitPrice: '' }],
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setSubmitting(false)
    }
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
                      <Input
                        id="customer"
                        value={form.customer}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, customer: e.target.value }))
                        }
                        placeholder="Store or buyer name"
                        autoComplete="organization"
                        required
                      />
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
                      <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                        <p className="text-sm font-medium text-foreground">Order total</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatGhs(computedTotal)}
                        </p>
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
