'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Download, Filter, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
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
import { Textarea } from '@/components/ui/textarea'
import { formatGhs } from '@/lib/dtc-orders'

type SfOrderStatus = 'ordered' | 'in_transit' | 'arrived'

type OrderItem = {
  sku?: string
  name: string
  qty: number
  unitPriceGhs: number
}

type OrderRow = {
  id: string
  orderNumber: string
  outletName: string
  repName: string | null
  items: OrderItem[]
  totalGhs: number
  paidGhs: number
  balanceGhs: number
  dueAt: string | null
  status: SfOrderStatus
  orderedAt: string
  notes: string | null
  createdAt: string
}

type StatsPayload = {
  ordersToday: number
  awaitingArrival: number
  avgOrderValue: number
}

type DraftItem = { sku: string; name: string; qty: string; unitPriceGhs: string }

function toDateValue(d: Date) {
  return d.toISOString().slice(0, 10)
}

function statusBadge(status: SfOrderStatus) {
  if (status === 'arrived') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Arrived</Badge>
  }
  if (status === 'in_transit') return <Badge variant="secondary">In transit</Badge>
  return <Badge variant="outline">Ordered</Badge>
}

export function SfOrdersEngineView() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [form, setForm] = useState({
    outletName: '',
    repName: '',
    orderedAt: toDateValue(new Date()),
    dueAt: '',
    paidGhs: '',
    status: 'ordered' as SfOrderStatus,
    notes: '',
    items: [{ sku: '', name: '', qty: '1', unitPriceGhs: '' } satisfies DraftItem],
  })

  const [editForm, setEditForm] = useState({
    outletName: '',
    repName: '',
    orderedAt: toDateValue(new Date()),
    dueAt: '',
    paidGhs: '',
    status: 'ordered' as SfOrderStatus,
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sf/orders', { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as { orders: OrderRow[]; stats: StatsPayload }
      setOrders(data.orders ?? [])
      setStats(data.stats ?? null)
    } catch {
      toast.error('Could not load SF orders')
      setOrders([])
      setStats(null)
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
    return orders.filter((o) => {
      return (
        o.orderNumber.toLowerCase().includes(q) ||
        o.outletName.toLowerCase().includes(q) ||
        (o.repName?.toLowerCase().includes(q) ?? false) ||
        o.status.includes(q)
      )
    })
  }, [orders, filter])

  const computedTotal = useMemo(() => {
    return form.items.reduce((sum, it) => {
      const qty = Number.parseInt(it.qty, 10)
      const unit = Number.parseFloat(it.unitPriceGhs)
      if (!Number.isFinite(qty) || qty <= 0) return sum
      if (!Number.isFinite(unit) || unit < 0) return sum
      return sum + qty * unit
    }, 0)
  }, [form.items])

  function openEdit(order: OrderRow) {
    setEditId(order.id)
    setEditForm({
      outletName: order.outletName,
      repName: order.repName ?? '',
      orderedAt: order.orderedAt.slice(0, 10),
      dueAt: order.dueAt ? order.dueAt.slice(0, 10) : '',
      paidGhs: String(order.paidGhs ?? 0),
      status: order.status,
      notes: order.notes ?? '',
    })
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const outletName = editForm.outletName.trim()
    if (!outletName) {
      toast.error('Outlet name is required')
      return
    }
    const paidGhs = editForm.paidGhs.trim() === '' ? 0 : Number(editForm.paidGhs)
    if (!Number.isFinite(paidGhs) || paidGhs < 0) {
      toast.error('Enter a valid paid amount')
      return
    }
    const orderedAt = editForm.orderedAt
      ? new Date(`${editForm.orderedAt}T12:00:00.000Z`).toISOString()
      : undefined
    const dueAt = editForm.dueAt.trim()
      ? new Date(`${editForm.dueAt}T12:00:00.000Z`).toISOString()
      : null

    setEditing(true)
    try {
      const res = await fetch(`/api/sf/orders/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          repName: editForm.repName.trim() === '' ? null : editForm.repName.trim(),
          orderedAt,
          dueAt,
          paidGhs,
          status: editForm.status,
          notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
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
      setEditId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update order')
    } finally {
      setEditing(false)
    }
  }

  async function removeOrder(order: Pick<OrderRow, 'id' | 'orderNumber'>) {
    if (!window.confirm(`Remove order ${order.orderNumber}? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/sf/orders/${order.id}`, {
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
    const outletName = form.outletName.trim()
    if (!outletName) {
      toast.error('Outlet name is required')
      return
    }

    const orderedAt = form.orderedAt
      ? new Date(`${form.orderedAt}T12:00:00.000Z`).toISOString()
      : undefined
    const dueAt = form.dueAt.trim()
      ? new Date(`${form.dueAt}T12:00:00.000Z`).toISOString()
      : undefined
    const paidGhs = form.paidGhs.trim() === '' ? undefined : Number(form.paidGhs)
    if (paidGhs !== undefined && (!Number.isFinite(paidGhs) || paidGhs < 0)) {
      toast.error('Enter a valid paid amount')
      return
    }

    const items = form.items
      .map((i) => ({
        sku: i.sku.trim() ? i.sku.trim() : undefined,
        name: i.name.trim(),
        qty: Number.parseInt(i.qty, 10),
        unitPriceGhs: Number.parseFloat(i.unitPriceGhs),
      }))
      .filter((i) => i.name)

    if (items.length === 0) {
      toast.error('Add at least one item')
      return
    }
    if (items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0)) {
      toast.error('Each item must have a valid quantity')
      return
    }
    if (items.some((i) => !Number.isFinite(i.unitPriceGhs) || i.unitPriceGhs < 0)) {
      toast.error('Each item must have a valid unit price')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/sf/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          repName: form.repName.trim() || undefined,
          orderedAt,
          dueAt,
          paidGhs,
          status: form.status,
          notes: form.notes.trim() || undefined,
          items,
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
      toast.success('SF order created')
      setDialogOpen(false)
      setForm({
        outletName: '',
        repName: '',
        orderedAt: toDateValue(new Date()),
        dueAt: '',
        paidGhs: '',
        status: 'ordered',
        notes: '',
        items: [{ sku: '', name: '', qty: '1', unitPriceGhs: '' }],
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
      'outletName',
      'repName',
      'itemsCount',
      'totalGhs',
      'paidGhs',
      'balanceGhs',
      'dueAt',
      'status',
      'orderedAt',
      'createdAt',
    ]
    const lines = [
      header.join(','),
      ...orders.map((o) =>
        [
          o.orderNumber,
          `"${o.outletName.replace(/"/g, '""')}"`,
          o.repName ? `"${o.repName.replace(/"/g, '""')}"` : '',
          o.items.length,
          o.totalGhs,
          o.paidGhs,
          o.balanceGhs,
          o.dueAt ?? '',
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
    a.download = `sf-orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Orders Engine"
        description="Log and track outlet orders from the field team (ordered → in transit → arrived)."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={() => {
                const el = document.getElementById('sf-orders-search')
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
                    <DialogTitle>New outlet order</DialogTitle>
                    <DialogDescription>Creates an order record in the SF database.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sf-outlet">Outlet</Label>
                        <Input
                          id="sf-outlet"
                          value={form.outletName}
                          onChange={(e) => setForm((f) => ({ ...f, outletName: e.target.value }))}
                          placeholder="Melcom Spintex"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sf-rep">Rep (optional)</Label>
                        <Input
                          id="sf-rep"
                          value={form.repName}
                          onChange={(e) => setForm((f) => ({ ...f, repName: e.target.value }))}
                          placeholder="Ama K."
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="sf-ordered-at">Ordered date</Label>
                        <Input
                          id="sf-ordered-at"
                          type="date"
                          value={form.orderedAt}
                          onChange={(e) => setForm((f) => ({ ...f, orderedAt: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sf-due">Due date (optional)</Label>
                        <Input
                          id="sf-due"
                          type="date"
                          value={form.dueAt}
                          onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) => setForm((f) => ({ ...f, status: v as SfOrderStatus }))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ordered">Ordered</SelectItem>
                            <SelectItem value="in_transit">In transit</SelectItem>
                            <SelectItem value="arrived">Arrived</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2 sm:max-w-sm">
                      <Label htmlFor="sf-paid">Paid (GHS)</Label>
                      <Input
                        id="sf-paid"
                        inputMode="decimal"
                        value={form.paidGhs}
                        onChange={(e) => setForm((f) => ({ ...f, paidGhs: e.target.value }))}
                        placeholder="0"
                      />
                      <p className="text-xs text-muted-foreground">
                        Balance is computed as Total − Paid.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sf-notes">Notes (optional)</Label>
                      <Textarea
                        id="sf-notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={3}
                        placeholder="Payment terms, delivery notes…"
                      />
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
                              items: [...f.items, { sku: '', name: '', qty: '1', unitPriceGhs: '' }],
                            }))
                          }
                        >
                          Add item
                        </Button>
                      </div>
                      <div className="space-y-3">
                        {form.items.map((it, idx) => (
                          <div key={idx} className="rounded-lg border border-border p-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`sf-item-${idx}`}>Product name</Label>
                                <Input
                                  id={`sf-item-${idx}`}
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
                                <Label htmlFor={`sf-sku-${idx}`}>SKU (optional)</Label>
                                <Input
                                  id={`sf-sku-${idx}`}
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
                                <Label htmlFor={`sf-qty-${idx}`}>Qty</Label>
                                <Input
                                  id={`sf-qty-${idx}`}
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
                                <Label htmlFor={`sf-unit-${idx}`}>Unit price (GHS)</Label>
                                <Input
                                  id={`sf-unit-${idx}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step="0.01"
                                  value={it.unitPriceGhs}
                                  onChange={(e) =>
                                    setForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], unitPriceGhs: e.target.value }
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
                                      const u = Number.parseFloat(it.unitPriceGhs)
                                      if (!Number.isFinite(q) || !Number.isFinite(u)) return '—'
                                      return formatGhs(q * u)
                                    })()}
                                  </span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
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
                  </div>
                  <DialogFooter>
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
          </>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Orders today
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : stats?.ordersToday ?? 0}
            </p>
          </Card>
          <Card className="border-l-4 border-l-blue-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Avg order value
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : formatGhs(stats?.avgOrderValue ?? 0)}
            </p>
          </Card>
          <Card className="border-l-4 border-l-amber-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Awaiting arrival
            </p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : stats?.awaitingArrival ?? 0}
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="max-w-md flex-1 space-y-2">
            <Label htmlFor="sf-orders-search" className="text-muted-foreground">
              Search orders
            </Label>
            <Input
              id="sf-orders-search"
              placeholder="Order #, outlet, rep, status…"
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
              {orders.length === 0 ? 'No orders yet. Create one with New order.' : 'No matches.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead className="hidden md:table-cell">Rep</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="hidden md:table-cell">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Ordered</TableHead>
                  <TableHead className="w-[88px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs font-medium">{o.orderNumber}</TableCell>
                    <TableCell className="font-medium">{o.outletName}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {o.repName ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                      {o.items.length}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatGhs(o.totalGhs)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">
                      {formatGhs(o.paidGhs)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatGhs(o.balanceGhs)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {o.dueAt ? format(new Date(o.dueAt), 'd MMM') : '—'}
                    </TableCell>
                    <TableCell>{statusBadge(o.status)}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {format(new Date(o.orderedAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(o)}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit order</DialogTitle>
              <DialogDescription>Update due date, paid, status, and notes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-outlet">Outlet</Label>
                <Input
                  id="edit-outlet"
                  value={editForm.outletName}
                  onChange={(e) => setEditForm((f) => ({ ...f, outletName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rep">Rep (optional)</Label>
                <Input
                  id="edit-rep"
                  value={editForm.repName}
                  onChange={(e) => setEditForm((f) => ({ ...f, repName: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-ordered-at">Ordered date</Label>
                  <Input
                    id="edit-ordered-at"
                    type="date"
                    value={editForm.orderedAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, orderedAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-due-at">Due date</Label>
                  <Input
                    id="edit-due-at"
                    type="date"
                    value={editForm.dueAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, dueAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-paid">Paid (GHS)</Label>
                  <Input
                    id="edit-paid"
                    inputMode="decimal"
                    value={editForm.paidGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, paidGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, status: v as SfOrderStatus }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="in_transit">In transit</SelectItem>
                      <SelectItem value="arrived">Arrived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes (optional)</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editing || !editId}>
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
    </div>
  )
}

