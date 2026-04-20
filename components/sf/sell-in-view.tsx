'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SellInPageHeader } from '@/components/sell-in/sell-in-page-header'
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
import { formatGhs } from '@/lib/dtc-orders'

type SellInStatus = 'ordered' | 'in_transit' | 'arrived'

type SellInRow = {
  id: string
  sellInGhs: number
  productName: string
  country: string
  manufacturerName: string
  manufacturerContact: string
  occurredAt: string
  quantity: number
  status: SellInStatus
  etaAt: string | null
}

function emptyForm() {
  return {
    sellInGhs: '',
    productName: '',
    country: '',
    manufacturerName: '',
    manufacturerContact: '',
    occurredAt: new Date().toISOString().slice(0, 10),
    quantity: '',
    status: 'ordered' as SellInStatus,
    etaAt: '',
  }
}

function dateToIsoNoon(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function statusBadge(status: SellInStatus) {
  if (status === 'arrived') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Arrived</Badge>
  }
  if (status === 'in_transit') {
    return <Badge variant="secondary">In transit</Badge>
  }
  return <Badge variant="outline">Ordered</Badge>
}

export function SellInView() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<SellInRow[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | SellInStatus>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sf/sell-in', { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as { rows: SellInRow[] }
      setRows(data.rows ?? [])
    } catch {
      toast.error('Could not load sell-in lines')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (!q) return true
      return (
        r.productName.toLowerCase().includes(q) ||
        r.country.toLowerCase().includes(q) ||
        r.manufacturerName.toLowerCase().includes(q) ||
        r.manufacturerContact.toLowerCase().includes(q) ||
        String(r.sellInGhs).includes(q) ||
        String(r.quantity).includes(q) ||
        r.status.includes(q)
      )
    })
  }, [rows, query, statusFilter])

  const totals = useMemo(() => {
    let totalSellIn = 0
    let totalQty = 0
    let totalValue = 0
    for (const r of filtered) {
      totalSellIn += r.sellInGhs
      totalQty += r.quantity
      totalValue += r.sellInGhs * r.quantity
    }
    return { totalSellIn, totalQty, totalValue, lines: filtered.length }
  }, [filtered])

  function openEdit(row: SellInRow) {
    setEditId(row.id)
    setEditForm({
      sellInGhs: String(row.sellInGhs),
      productName: row.productName,
      country: row.country,
      manufacturerName: row.manufacturerName,
      manufacturerContact: row.manufacturerContact,
      occurredAt: row.occurredAt.slice(0, 10),
      quantity: String(row.quantity),
      status: row.status,
      etaAt: row.etaAt ? row.etaAt.slice(0, 10) : '',
    })
    setEditOpen(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const sellInGhs = Number(form.sellInGhs)
    const quantity = Number(form.quantity)
    const productName = form.productName.trim()
    const country = form.country.trim()
    const manufacturerName = form.manufacturerName.trim()
    const manufacturerContact = form.manufacturerContact.trim()
    if (!productName) {
      toast.error('Enter a product name')
      return
    }
    if (!country) {
      toast.error('Enter a country')
      return
    }
    if (!manufacturerName) {
      toast.error('Enter a manufacturer name')
      return
    }
    if (!manufacturerContact) {
      toast.error('Enter a manufacturer contact')
      return
    }
    if (!Number.isFinite(sellInGhs) || sellInGhs < 0) {
      toast.error('Enter a valid sell-in value')
      return
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error('Enter a valid quantity')
      return
    }
    const occurredAt = dateToIsoNoon(form.occurredAt)
    if (!occurredAt) {
      toast.error('Select a date')
      return
    }
    const etaAt = form.etaAt.trim() ? dateToIsoNoon(form.etaAt) : undefined

    setCreating(true)
    try {
      const res = await fetch('/api/sf/sell-in', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellInGhs,
          productName,
          country,
          manufacturerName,
          manufacturerContact,
          occurredAt,
          quantity,
          status: form.status,
          etaAt,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Could not save')
      }
      toast.success('Sell-in saved')
      setCreateOpen(false)
      setForm(emptyForm())
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save sell-in')
    } finally {
      setCreating(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const sellInGhs = Number(editForm.sellInGhs)
    const quantity = Number(editForm.quantity)
    const productName = editForm.productName.trim()
    const country = editForm.country.trim()
    const manufacturerName = editForm.manufacturerName.trim()
    const manufacturerContact = editForm.manufacturerContact.trim()
    if (!productName) {
      toast.error('Enter a product name')
      return
    }
    if (!country) {
      toast.error('Enter a country')
      return
    }
    if (!manufacturerName) {
      toast.error('Enter a manufacturer name')
      return
    }
    if (!manufacturerContact) {
      toast.error('Enter a manufacturer contact')
      return
    }
    if (!Number.isFinite(sellInGhs) || sellInGhs < 0) {
      toast.error('Enter a valid sell-in value')
      return
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error('Enter a valid quantity')
      return
    }
    const occurredAt = dateToIsoNoon(editForm.occurredAt)
    if (!occurredAt) {
      toast.error('Select a date')
      return
    }
    const etaAt = editForm.etaAt.trim() ? dateToIsoNoon(editForm.etaAt) : null

    setEditing(true)
    try {
      const res = await fetch(`/api/sf/sell-in/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellInGhs,
          productName,
          country,
          manufacturerName,
          manufacturerContact,
          occurredAt,
          quantity,
          status: editForm.status,
          etaAt,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Could not update')
      }
      toast.success('Updated')
      setEditOpen(false)
      setEditId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    } finally {
      setEditing(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this sell-in row?')) return
    try {
      const res = await fetch(`/api/sf/sell-in/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Removed')
      await load()
    } catch {
      toast.error('Could not delete sell-in row')
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SellInPageHeader
        title="Sell-in"
        description="Track sell-in lines and shipment progress (ordered → in transit → arrived)."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add sell-in
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <form onSubmit={submitCreate}>
                <DialogHeader>
                  <DialogTitle>Add sell-in line</DialogTitle>
                  <DialogDescription>
                    Record a product sell-in with quantity and shipping status.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="si-sellin">Unit sell-in (GHS)</Label>
                      <Input
                        id="si-sellin"
                        inputMode="decimal"
                        value={form.sellInGhs}
                        onChange={(e) => setForm((f) => ({ ...f, sellInGhs: e.target.value }))}
                        placeholder="0"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="si-qty">Quantity</Label>
                      <Input
                        id="si-qty"
                        inputMode="numeric"
                        value={form.quantity}
                        onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                        placeholder="0"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-product">Product name</Label>
                    <Input
                      id="si-product"
                      value={form.productName}
                      onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                      placeholder="Gelos Charcoal Toothpaste"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="si-country">Country</Label>
                      <Input
                        id="si-country"
                        value={form.country}
                        onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                        placeholder="Ghana"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="si-mfg">Manufacturer name</Label>
                      <Input
                        id="si-mfg"
                        value={form.manufacturerName}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, manufacturerName: e.target.value }))
                        }
                        placeholder="Gelos Manufacturing Ltd"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-mfg-contact">Manufacturer contact</Label>
                    <Input
                      id="si-mfg-contact"
                      value={form.manufacturerContact}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, manufacturerContact: e.target.value }))
                      }
                      placeholder="Phone / email"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="si-date">Date</Label>
                      <Input
                        id="si-date"
                        type="date"
                        value={form.occurredAt}
                        onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v) => setForm((f) => ({ ...f, status: v as SellInStatus }))}
                      >
                        <SelectTrigger>
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
                    <Label htmlFor="si-eta">ETA (optional)</Label>
                    <Input
                      id="si-eta"
                      type="date"
                      value={form.etaAt}
                      onChange={(e) => setForm((f) => ({ ...f, etaAt: e.target.value }))}
                    />
                  </div>
                  <div className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Total ={' '}
                    <span className="font-semibold text-foreground">
                      {(() => {
                        const u = Number(form.sellInGhs)
                        const q = Number(form.quantity)
                        if (!Number.isFinite(u) || !Number.isFinite(q)) return '—'
                        return formatGhs(Math.max(0, u) * Math.max(0, q))
                      })()}
                    </span>
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
                        Saving
                      </>
                    ) : (
                      'Save'
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Lines</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : totals.lines}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Matches current filters</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Total quantity</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : totals.totalQty.toLocaleString()}
            </p>
          </Card>
          <Card className="border-l-4 border-l-emerald-600 p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Total value</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : formatGhs(totals.totalValue)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Unit sell-in × quantity</p>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md flex-1 space-y-2">
            <Label htmlFor="si-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="si-search"
            placeholder="Product, country, manufacturer, status…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:w-56">
            <Label className="text-muted-foreground">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as 'all' | SellInStatus)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="ordered">Ordered</SelectItem>
                <SelectItem value="in_transit">In transit</SelectItem>
                <SelectItem value="arrived">Arrived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Sell-in lines
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? 'No sell-in lines yet. Add one above.' : 'No matches.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Unit sell-in</TableHead>
                  <TableHead>Product name</TableHead>
                  <TableHead className="hidden lg:table-cell">Country</TableHead>
                  <TableHead className="hidden lg:table-cell">Manufacturer</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Total</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>In transit</TableHead>
                  <TableHead>Arrived | ETA</TableHead>
                  <TableHead className="w-[88px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const isOrdered = r.status === 'ordered'
                  const isTransit = r.status === 'in_transit'
                  const isArrived = r.status === 'arrived'
                  const total = r.sellInGhs * r.quantity
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatGhs(r.sellInGhs)}
                      </TableCell>
                      <TableCell className="font-medium">{r.productName}</TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {r.country}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        <div className="min-w-0">
                          <p className="truncate">{r.manufacturerName}</p>
                          <p className="truncate text-xs">{r.manufacturerContact}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {format(new Date(r.occurredAt), 'd MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right font-semibold tabular-nums">
                        {formatGhs(total)}
                      </TableCell>
                      <TableCell>{isOrdered ? statusBadge('ordered') : <span>—</span>}</TableCell>
                      <TableCell>{isTransit ? statusBadge('in_transit') : <span>—</span>}</TableCell>
                      <TableCell>
                        {isArrived ? (
                          statusBadge('arrived')
                        ) : r.etaAt ? (
                          <span className="text-sm text-muted-foreground">
                            ETA {format(new Date(r.etaAt), 'd MMM')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(r)}
                            aria-label="Edit sell-in"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => void remove(r.id)}
                            aria-label="Delete sell-in"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit sell-in</DialogTitle>
              <DialogDescription>Update sell-in amount, status, or ETA.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-si-sellin">Unit sell-in (GHS)</Label>
                  <Input
                    id="edit-si-sellin"
                    inputMode="decimal"
                    value={editForm.sellInGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, sellInGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-si-qty">Quantity</Label>
                  <Input
                    id="edit-si-qty"
                    inputMode="numeric"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-si-product">Product name</Label>
                <Input
                  id="edit-si-product"
                  value={editForm.productName}
                  onChange={(e) => setEditForm((f) => ({ ...f, productName: e.target.value }))}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-si-country">Country</Label>
                  <Input
                    id="edit-si-country"
                    value={editForm.country}
                    onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-si-mfg">Manufacturer name</Label>
                  <Input
                    id="edit-si-mfg"
                    value={editForm.manufacturerName}
                    onChange={(e) => setEditForm((f) => ({ ...f, manufacturerName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-si-mfg-contact">Manufacturer contact</Label>
                <Input
                  id="edit-si-mfg-contact"
                  value={editForm.manufacturerContact}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, manufacturerContact: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-si-date">Date</Label>
                  <Input
                    id="edit-si-date"
                    type="date"
                    value={editForm.occurredAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, status: v as SellInStatus }))
                    }
                  >
                    <SelectTrigger>
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
                <Label htmlFor="edit-si-eta">ETA (optional)</Label>
                <Input
                  id="edit-si-eta"
                  type="date"
                  value={editForm.etaAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, etaAt: e.target.value }))}
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
                    Saving
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

