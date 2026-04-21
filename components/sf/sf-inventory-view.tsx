'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, Pencil, Plus, ScanBarcode, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  outlet: string
  repName?: string
  costGhs: number | null
  priceGhs: number | null
  onHand: number
  safetyStock: number
  dailyDemand: number
  daysCover: number | null
  health: StockHealth
  lastCountedAt?: string
  createdAt: string
  updatedAt: string
}

type StatsPayload = {
  outletsTracked: number
  skusTracked: number
  belowSafety: number
  critical: number
}

function healthBadge(h: StockHealth) {
  if (h === 'ok') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Healthy</Badge>
  }
  if (h === 'low') {
    return <Badge variant="secondary">Low</Badge>
  }
  return <Badge variant="destructive">Critical</Badge>
}

export function SfInventoryView() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [outletFilter, setOutletFilter] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<{
    sku: string
    name: string
    outlet: string
    repName: string
    costGhs: string
    priceGhs: string
    onHand: string
    safetyStock: string
    lastCountedAt: string
  }>({
    sku: '',
    name: '',
    outlet: '',
    repName: '',
    costGhs: '',
    priceGhs: '',
    onHand: '',
    safetyStock: '',
    lastCountedAt: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editRow, setEditRow] = useState<InventoryRow | null>(null)
  const [deleteRow, setDeleteRow] = useState<InventoryRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    name: '',
    outlet: '',
    repName: '',
    costGhs: '',
    priceGhs: '',
    onHand: '',
    safetyStock: '',
    lastCountedAt: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sf/inventory', { credentials: 'include' })
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
      toast.error('Could not load retail inventory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const outletOptions = useMemo(() => {
    const set = new Set<string>()
    for (const row of items) {
      if (row.outlet) set.add(row.outlet)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((row) => {
      if (outletFilter !== 'all' && row.outlet !== outletFilter) return false
      if (!q) return true
      return (
        row.sku.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.outlet.toLowerCase().includes(q) ||
        (row.repName ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, outletFilter, query])

  function openEdit(row: InventoryRow) {
    setEditRow(row)
    setEditForm({
      name: row.name,
      outlet: row.outlet,
      repName: row.repName ?? '',
      costGhs: row.costGhs != null ? String(row.costGhs) : '',
      priceGhs: row.priceGhs != null ? String(row.priceGhs) : '',
      onHand: String(row.onHand),
      safetyStock: String(row.safetyStock),
      lastCountedAt: row.lastCountedAt ? row.lastCountedAt.slice(0, 16) : '',
    })
    setEditOpen(true)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return

    const name = editForm.name.trim()
    const outlet = editForm.outlet.trim()
    if (!name || !outlet) {
      toast.error('Product name and outlet are required')
      return
    }

    const onHand = Number(editForm.onHand)
    const safetyStock = Number(editForm.safetyStock)
    const costGhs = editForm.costGhs.trim() === '' ? null : Number(editForm.costGhs)
    const priceGhs = editForm.priceGhs.trim() === '' ? null : Number(editForm.priceGhs)
    if (!Number.isFinite(onHand) || !Number.isFinite(safetyStock) || onHand < 0 || safetyStock < 0) {
      toast.error('Enter valid numbers for stock fields')
      return
    }
    if (
      (costGhs !== null && (!Number.isFinite(costGhs) || costGhs < 0)) ||
      (priceGhs !== null && (!Number.isFinite(priceGhs) || priceGhs < 0))
    ) {
      toast.error('Enter valid numbers for cost and price')
      return
    }

    setEditing(true)
    try {
      const res = await fetch(`/api/sf/inventory/${editRow.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          outlet,
          repName: editForm.repName.trim() ? editForm.repName.trim() : null,
          costGhs,
          priceGhs,
          onHand,
          safetyStock,
          lastCountedAt: editForm.lastCountedAt
            ? new Date(editForm.lastCountedAt).toISOString()
            : null,
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
      toast.success('SF stock updated')
      setEditOpen(false)
      setEditRow(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update')
    } finally {
      setEditing(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const sku = createForm.sku.trim()
    const name = createForm.name.trim()
    const outlet = createForm.outlet.trim()
    if (!sku || !name || !outlet) {
      toast.error('SKU, product name, and outlet are required')
      return
    }

    const onHand = Number(createForm.onHand)
    const safetyStock = Number(createForm.safetyStock)
    const costGhs = createForm.costGhs.trim() === '' ? undefined : Number(createForm.costGhs)
    const priceGhs = createForm.priceGhs.trim() === '' ? undefined : Number(createForm.priceGhs)
    if (
      !Number.isFinite(onHand) ||
      !Number.isFinite(safetyStock) ||
      onHand < 0 ||
      safetyStock < 0
    ) {
      toast.error('Enter valid numbers for stock fields')
      return
    }
    if (
      (costGhs !== undefined && (!Number.isFinite(costGhs) || costGhs < 0)) ||
      (priceGhs !== undefined && (!Number.isFinite(priceGhs) || priceGhs < 0))
    ) {
      toast.error('Enter valid numbers for cost and price')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/sf/inventory', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku,
          name,
          outlet,
          repName: createForm.repName.trim() || undefined,
          costGhs,
          priceGhs,
          onHand,
          safetyStock,
          lastCountedAt: createForm.lastCountedAt
            ? new Date(createForm.lastCountedAt).toISOString()
            : undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (res.status === 409) {
        toast.error('That SKU already exists for this outlet')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Outlet SKU added')
      setCreateOpen(false)
      setCreateForm({
        sku: '',
        name: '',
        outlet: '',
        repName: '',
        costGhs: '',
        priceGhs: '',
        onHand: '',
        safetyStock: '',
        lastCountedAt: '',
      })
      void load()
    } catch {
      toast.error('Could not add outlet SKU')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteRow) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sf/inventory/${deleteRow.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Delete failed')
      }
      toast.success('Outlet SKU deleted')
      setDeleteRow(null)
      void load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  function handleExport() {
    if (items.length === 0) {
      toast.message('No rows to export yet')
      return
    }
    const header = [
      'outlet',
      'repName',
      'sku',
      'name',
      'costGhs',
      'priceGhs',
      'onHand',
      'safetyStock',
      'dailyDemand',
      'daysCover',
      'health',
      'lastCountedAt',
      'updatedAt',
    ]
    const lines = [
      header.join(','),
      ...items.map((r) =>
        [
          `"${r.outlet.replace(/"/g, '""')}"`,
          `"${(r.repName ?? '').replace(/"/g, '""')}"`,
          r.sku,
          `"${r.name.replace(/"/g, '""')}"`,
          r.costGhs ?? '',
          r.priceGhs ?? '',
          r.onHand,
          r.safetyStock,
          r.dailyDemand,
          r.daysCover ?? '',
          r.health,
          r.lastCountedAt ?? '',
          r.updatedAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sf-inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Retail Inventory"
        description="Outlet-level stock counts captured by the field team. Track on-hand, safety stock, and (optional) days of cover."
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
                  Add outlet SKU
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleCreate}>
                  <DialogHeader>
                    <DialogTitle>Add outlet stock line</DialogTitle>
                    <DialogDescription>
                      Create a SKU line per outlet. Use safety stock and demand (optional) to
                      surface health and days of cover.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sf-sku">SKU</Label>
                        <Input
                          id="sf-sku"
                          className="font-mono"
                          value={createForm.sku}
                          onChange={(e) => setCreateForm((f) => ({ ...f, sku: e.target.value }))}
                          placeholder="GLO-CHAR-100"
                          autoComplete="off"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sf-rep">Rep (optional)</Label>
                        <Input
                          id="sf-rep"
                          value={createForm.repName}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, repName: e.target.value }))
                          }
                          placeholder="Ama K."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sf-name">Product name</Label>
                      <Input
                        id="sf-name"
                        value={createForm.name}
                        onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Charcoal toothpaste"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sf-outlet">Outlet</Label>
                      <Input
                        id="sf-outlet"
                        value={createForm.outlet}
                        onChange={(e) => setCreateForm((f) => ({ ...f, outlet: e.target.value }))}
                        placeholder="Melcom Spintex"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sf-on">On hand (units)</Label>
                        <Input
                          id="sf-on"
                          inputMode="numeric"
                          value={createForm.onHand}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, onHand: e.target.value }))
                          }
                          placeholder="24"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sf-safe">Safety stock</Label>
                        <Input
                          id="sf-safe"
                          inputMode="numeric"
                          value={createForm.safetyStock}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, safetyStock: e.target.value }))
                          }
                          placeholder="10"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sf-counted">Last counted (optional)</Label>
                      <Input
                        id="sf-counted"
                        type="datetime-local"
                        value={createForm.lastCountedAt}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, lastCountedAt: e.target.value }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Velocity (daily demand) is auto-calculated from Retail Orders.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sf-cost">Cost (GHS)</Label>
                        <Input
                          id="sf-cost"
                          inputMode="decimal"
                          value={createForm.costGhs}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, costGhs: e.target.value }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sf-price">Price (GHS)</Label>
                        <Input
                          id="sf-price"
                          inputMode="decimal"
                          value={createForm.priceGhs}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, priceGhs: e.target.value }))
                          }
                          placeholder="0.00"
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
                          Saving
                        </>
                      ) : (
                        'Save line'
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
        <div className="grid gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Outlets tracked</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (stats?.outletsTracked ?? 0)}
            </p>
          </Card>
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
          <Card className="border-l-4 border-l-red-600 p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Critical</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (stats?.critical ?? 0)}
            </p>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="sf-inv-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="sf-inv-search"
              placeholder="Outlet, rep, SKU, product…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:w-72">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <ScanBarcode className="h-3.5 w-3.5" />
              Outlet
            </Label>
            <Select value={outletFilter} onValueChange={setOutletFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All outlets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outlets</SelectItem>
                {outletOptions.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Outlet stock</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScanBarcode className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No outlet lines yet</EmptyTitle>
                <EmptyDescription>
                  Add outlet stock lines to track on-hand levels and surface low / critical outlets.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead className="hidden lg:table-cell">Rep</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Cost</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Price</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Days cover</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="w-[52px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.outlet}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {row.repName ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium">{row.sku}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                      {row.costGhs == null ? '—' : formatGhs(row.costGhs)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                      {row.priceGhs == null ? '—' : formatGhs(row.priceGhs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.onHand}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {row.daysCover === null ? '—' : `${row.daysCover}d`}
                    </TableCell>
                    <TableCell>{healthBadge(row.health)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(row)}
                          aria-label={`Edit ${row.outlet} ${row.sku}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteRow(row)}
                          aria-label={`Delete ${row.outlet} ${row.sku}`}
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

        {!loading && items.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No rows match your filters. Try another search or outlet.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Update outlet stock</DialogTitle>
              <DialogDescription>
                {editRow ? (
                  <>
                    Adjust levels for{' '}
                    <span className="font-medium">{editRow.outlet}</span> ·{' '}
                    <span className="font-mono font-medium">{editRow.sku}</span>.
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            {editRow ? (
              <div className="grid gap-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sf-edit-outlet">Outlet</Label>
                    <Input
                      id="sf-edit-outlet"
                      value={editForm.outlet}
                      onChange={(e) => setEditForm((f) => ({ ...f, outlet: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-edit-rep">Rep (optional)</Label>
                    <Input
                      id="sf-edit-rep"
                      value={editForm.repName}
                      onChange={(e) => setEditForm((f) => ({ ...f, repName: e.target.value }))}
                      placeholder="Ama K."
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sf-edit-name">Product name</Label>
                  <Input
                    id="sf-edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sf-edit-on">On hand</Label>
                    <Input
                      id="sf-edit-on"
                      inputMode="numeric"
                      value={editForm.onHand}
                      onChange={(e) => setEditForm((f) => ({ ...f, onHand: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-edit-safe">Safety stock</Label>
                    <Input
                      id="sf-edit-safe"
                      inputMode="numeric"
                      value={editForm.safetyStock}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, safetyStock: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sf-edit-counted">Last counted</Label>
                  <Input
                    id="sf-edit-counted"
                    type="datetime-local"
                    value={editForm.lastCountedAt}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, lastCountedAt: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Velocity (daily demand) is auto-calculated from Retail Orders.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="sf-edit-cost">Cost (GHS)</Label>
                    <Input
                      id="sf-edit-cost"
                      inputMode="decimal"
                      value={editForm.costGhs}
                      onChange={(e) => setEditForm((f) => ({ ...f, costGhs: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sf-edit-price">Price (GHS)</Label>
                    <Input
                      id="sf-edit-price"
                      inputMode="decimal"
                      value={editForm.priceGhs}
                      onChange={(e) => setEditForm((f) => ({ ...f, priceGhs: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
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

      <AlertDialog open={!!deleteRow} onOpenChange={(open) => (open ? null : setDeleteRow(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete outlet SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow ? (
                <>
                  This will permanently remove{' '}
                  <span className="font-medium">{deleteRow.outlet}</span> ·{' '}
                  <span className="font-mono font-medium">{deleteRow.sku}</span>.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={handleDeleteConfirmed}>
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

