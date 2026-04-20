'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Pencil, Plus, Warehouse } from 'lucide-react'
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
import type { StockHealth } from '@/lib/dtc-inventory'
import { formatGhs } from '@/lib/dtc-orders'

type InventoryRow = {
  id: string
  sku: string
  name: string
  warehouse: string
  costGhs: number | null
  priceGhs: number | null
  onHand: number
  safetyStock: number
  dailyDemand: number
  daysCover: number | null
  health: StockHealth
  inTransitValue: number
  createdAt: string
  updatedAt: string
}

type StatsPayload = {
  skusTracked: number
  belowSafety: number
  inTransitTotalGhs: number
}

const WAREHOUSE_PRESETS = [
  'Main FC',
  'Web fulfilment',
  'B2B hub',
  'Accra hub',
  'Tema DC',
] as const

function healthBadge(h: StockHealth) {
  if (h === 'ok') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Healthy</Badge>
  }
  if (h === 'low') {
    return <Badge variant="secondary">Low</Badge>
  }
  return <Badge variant="destructive">Critical</Badge>
}

export function DtcInventoryView() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<{
    sku: string
    name: string
    warehouse: string
    costGhs: string
    priceGhs: string
    onHand: string
    safetyStock: string
    inTransitValue: string
  }>({
    sku: '',
    name: '',
    warehouse: WAREHOUSE_PRESETS[0],
    costGhs: '',
    priceGhs: '',
    onHand: '',
    safetyStock: '',
    inTransitValue: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editRow, setEditRow] = useState<InventoryRow | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    warehouse: '',
    costGhs: '',
    priceGhs: '',
    onHand: '',
    safetyStock: '',
    inTransitValue: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dtc/inventory', { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load inventory')
      const data = (await res.json()) as {
        items: InventoryRow[]
        stats: StatsPayload
      }
      setItems(data.items)
      setStats(data.stats)
    } catch {
      toast.error('Could not load inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const warehouseOptions = useMemo(() => {
    const fromData = new Set<string>()
    for (const row of items) {
      if (row.warehouse) fromData.add(row.warehouse)
    }
    for (const w of WAREHOUSE_PRESETS) fromData.add(w)
    return Array.from(fromData).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((row) => {
      if (warehouseFilter !== 'all' && row.warehouse !== warehouseFilter) {
        return false
      }
      if (!q) return true
      return (
        row.sku.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.warehouse.toLowerCase().includes(q)
      )
    })
  }, [items, query, warehouseFilter])

  function openEdit(row: InventoryRow) {
    setEditRow(row)
    setEditForm({
      name: row.name,
      warehouse: row.warehouse,
      costGhs: row.costGhs == null ? '' : String(row.costGhs),
      priceGhs: row.priceGhs == null ? '' : String(row.priceGhs),
      onHand: String(row.onHand),
      safetyStock: String(row.safetyStock),
      inTransitValue: String(row.inTransitValue),
    })
    setEditOpen(true)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    const costGhs = editForm.costGhs.trim() === '' ? null : Number(editForm.costGhs)
    const priceGhs = editForm.priceGhs.trim() === '' ? null : Number(editForm.priceGhs)
    const onHand = Number(editForm.onHand)
    const safetyStock = Number(editForm.safetyStock)
    const inTransitValue = Number(editForm.inTransitValue)
    const name = editForm.name.trim()
    const warehouse = editForm.warehouse.trim()
    if (!name || !warehouse) {
      toast.error('Name and warehouse are required')
      return
    }
    if (
      (costGhs !== null && (!Number.isFinite(costGhs) || costGhs < 0)) ||
      (priceGhs !== null && (!Number.isFinite(priceGhs) || priceGhs < 0)) ||
      !Number.isFinite(onHand) ||
      !Number.isFinite(safetyStock) ||
      !Number.isFinite(inTransitValue) ||
      onHand < 0 ||
      safetyStock < 0 ||
      inTransitValue < 0
    ) {
      toast.error('Enter valid numbers for stock fields')
      return
    }
    setEditing(true)
    try {
      const res = await fetch(`/api/dtc/inventory/${editRow.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          warehouse,
          costGhs,
          priceGhs,
          onHand,
          safetyStock,
          inTransitValue,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Update failed')
      }
      toast.success('Stock updated')
      setEditOpen(false)
      setEditRow(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    } finally {
      setEditing(false)
    }
  }

  function handleExport() {
    if (items.length === 0) {
      toast.message('No rows to export yet')
      return
    }
    const header = [
      'sku',
      'name',
      'warehouse',
      'onHand',
      'safetyStock',
      'dailyDemand',
      'daysCover',
      'health',
      'inTransitValue',
      'updatedAt',
    ]
    const lines = [
      header.join(','),
      ...items.map((r) =>
        [
          r.sku,
          `"${r.name.replace(/"/g, '""')}"`,
          `"${r.warehouse.replace(/"/g, '""')}"`,
          r.onHand,
          r.safetyStock,
          r.dailyDemand,
          r.daysCover ?? '',
          r.health,
          r.inTransitValue,
          r.updatedAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const sku = createForm.sku.trim()
    const name = createForm.name.trim()
    if (!sku || !name) {
      toast.error('SKU and product name are required')
      return
    }
    const costGhs = createForm.costGhs.trim() === '' ? undefined : Number(createForm.costGhs)
    const priceGhs = createForm.priceGhs.trim() === '' ? undefined : Number(createForm.priceGhs)
    const onHand = Number(createForm.onHand)
    const safetyStock = Number(createForm.safetyStock)
    const inTransitValue = Number(createForm.inTransitValue)
    if (
      (costGhs !== undefined && (!Number.isFinite(costGhs) || costGhs < 0)) ||
      (priceGhs !== undefined && (!Number.isFinite(priceGhs) || priceGhs < 0)) ||
      !Number.isFinite(onHand) ||
      !Number.isFinite(safetyStock) ||
      !Number.isFinite(inTransitValue)
    ) {
      toast.error('Enter valid numbers for stock fields')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/dtc/inventory', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          name,
          warehouse: createForm.warehouse,
          costGhs,
          priceGhs,
          onHand,
          safetyStock,
          inTransitValue,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (res.status === 409) {
        toast.error('That SKU already exists')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('SKU added')
      setCreateOpen(false)
      setCreateForm({
        sku: '',
        name: '',
        warehouse: WAREHOUSE_PRESETS[0],
        costGhs: '',
        priceGhs: '',
        onHand: '',
        safetyStock: '',
        inTransitValue: '',
      })
      void load()
    } catch {
      toast.error('Could not add SKU')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="DTC Inventory"
        description="Sell-out stock levels for web and fulfilment centres. Days of cover helps prioritise replenishment."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleExport}
              disabled={loading || items.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add SKU
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Add inventory SKU</DialogTitle>
                    <DialogDescription>
                      Track on-hand units, safety stock, and demand to surface days of cover and
                      health.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inv-sku">SKU</Label>
                        <Input
                          id="inv-sku"
                          className="font-mono"
                          value={createForm.sku}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, sku: e.target.value }))
                          }
                          placeholder="GLO-CHAR-100"
                          autoComplete="off"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inv-wh">Warehouse</Label>
                        <Select
                          value={createForm.warehouse}
                          onValueChange={(v) =>
                            setCreateForm((f) => ({ ...f, warehouse: v }))
                          }
                        >
                          <SelectTrigger id="inv-wh">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WAREHOUSE_PRESETS.map((w) => (
                              <SelectItem key={w} value={w}>
                                {w}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inv-name">Product name</Label>
                      <Input
                        id="inv-name"
                        value={createForm.name}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, name: e.target.value }))
                        }
                        placeholder="Charcoal toothpaste"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inv-cost">Cost (GHS)</Label>
                        <Input
                          id="inv-cost"
                          inputMode="decimal"
                          value={createForm.costGhs}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, costGhs: e.target.value }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inv-price">Price (GHS)</Label>
                        <Input
                          id="inv-price"
                          inputMode="decimal"
                          value={createForm.priceGhs}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, priceGhs: e.target.value }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="inv-on">On hand (units)</Label>
                        <Input
                          id="inv-on"
                          inputMode="numeric"
                          value={createForm.onHand}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, onHand: e.target.value }))
                          }
                          placeholder="240"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inv-safe">Safety stock</Label>
                        <Input
                          id="inv-safe"
                          inputMode="numeric"
                          value={createForm.safetyStock}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, safetyStock: e.target.value }))
                          }
                          placeholder="80"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inv-transit">In transit (GHS)</Label>
                      <Input
                        id="inv-transit"
                        inputMode="decimal"
                        value={createForm.inTransitValue}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            inTransitValue: e.target.value,
                          }))
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving
                        </>
                      ) : (
                        'Save SKU'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">SKUs tracked</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (stats?.skusTracked ?? 0)}
            </p>
          </Card>
          <Card className="border-l-4 border-l-amber-600 p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Below safety</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (stats?.belowSafety ?? 0)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">In transit</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : formatGhs(stats?.inTransitTotalGhs ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Open PO / inbound value</p>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="inv-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="inv-search"
              placeholder="SKU, product, warehouse…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:w-56">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Warehouse className="h-3.5 w-3.5" />
              Warehouse
            </Label>
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All warehouses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All warehouses</SelectItem>
                {warehouseOptions.map((w) => (
                  <SelectItem key={w} value={w}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">DTC Inventory</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Warehouse className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No SKUs yet</EmptyTitle>
                <EmptyDescription>
                  Add your first SKU to track on-hand stock, safety levels, and days of cover
                  across warehouses.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Cost</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Price</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Margin</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="hidden md:table-cell text-center">Reorder</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Velocity</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Days Left</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="w-[52px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs font-medium text-muted-foreground">
                      {row.sku}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums text-sm">
                      {row.costGhs == null ? '—' : formatGhs(row.costGhs)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums text-sm">
                      {row.priceGhs == null ? '—' : formatGhs(row.priceGhs)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums text-sm">
                      {(() => {
                        if (row.costGhs == null || row.priceGhs == null || row.priceGhs <= 0) {
                          return <span className="text-muted-foreground">—</span>
                        }
                        const pct = ((row.priceGhs - row.costGhs) / row.priceGhs) * 100
                        const cls =
                          pct >= 50
                            ? 'text-emerald-600'
                            : pct >= 25
                              ? 'text-amber-600'
                              : 'text-destructive'
                        return <span className={cls}>{Math.round(pct * 10) / 10}%</span>
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[150px]">
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              row.health === 'ok'
                                ? 'text-emerald-600'
                                : row.health === 'low'
                                  ? 'text-amber-600'
                                  : 'text-destructive'
                            }`}
                          >
                            {row.onHand}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.safetyStock > 0 ? `/${row.safetyStock}` : ''}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                          {(() => {
                            const denom =
                              row.safetyStock > 0 ? row.safetyStock : Math.max(1, row.onHand)
                            const pct = Math.min(100, Math.round((row.onHand / denom) * 100))
                            const barClass =
                              row.health === 'ok'
                                ? 'bg-emerald-600'
                                : row.health === 'low'
                                  ? 'bg-amber-600'
                                  : 'bg-destructive'
                            return (
                              <div
                                className={`h-1.5 rounded-full ${barClass}`}
                                style={{ width: `${pct}%` }}
                              />
                            )
                          })()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-center tabular-nums text-sm text-muted-foreground">
                      {row.safetyStock}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums text-sm text-muted-foreground">
                      {row.dailyDemand > 0 ? `${Math.round(row.dailyDemand * 10) / 10}/day` : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums text-sm">
                      {row.daysCover === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={row.daysCover <= 10 ? 'text-amber-600' : 'text-emerald-600'}>
                          {row.daysCover}d
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.health === 'ok' ? (
                        <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/10 dark:text-emerald-400">
                          OK
                        </Badge>
                      ) : row.health === 'low' ? (
                        <Badge className="bg-rose-600/10 text-rose-700 hover:bg-rose-600/10 dark:text-rose-400">
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Critical</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(row)}
                        aria-label={`Edit ${row.sku}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {!loading && items.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No rows match your filters. Try another search or warehouse.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Update stock</DialogTitle>
              <DialogDescription>
                {editRow ? (
                  <>
                    Adjust levels for <span className="font-mono font-medium">{editRow.sku}</span>.
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            {editRow ? (
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Product name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-wh">Warehouse</Label>
                  <Input
                    id="edit-wh"
                    value={editForm.warehouse}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, warehouse: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-cost">Cost (GHS)</Label>
                    <Input
                      id="edit-cost"
                      inputMode="decimal"
                      value={editForm.costGhs}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, costGhs: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-price">Price (GHS)</Label>
                    <Input
                      id="edit-price"
                      inputMode="decimal"
                      value={editForm.priceGhs}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, priceGhs: e.target.value }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-on">On hand</Label>
                    <Input
                      id="edit-on"
                      inputMode="numeric"
                      value={editForm.onHand}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, onHand: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-safe">Safety stock</Label>
                    <Input
                      id="edit-safe"
                      inputMode="numeric"
                      value={editForm.safetyStock}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, safetyStock: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-transit">In transit (GHS)</Label>
                  <Input
                    id="edit-transit"
                    inputMode="decimal"
                    value={editForm.inTransitValue}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        inTransitValue: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editing || !editRow}>
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
