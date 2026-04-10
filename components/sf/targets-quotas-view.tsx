'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Loader2, Pencil, Plus, Target } from 'lucide-react'
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
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

type TargetRow = {
  id: string
  month: string
  repName: string
  region?: string
  targetVisits: number
  targetSellInGhs: number
  notes?: string
  createdAt: string
  updatedAt: string
  actualVisitsMtd: number
  actualSellInMtdGhs: number
  visitsAttainmentPct: number | null
  sellInAttainmentPct: number | null
}

function monthKeyForDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function attainmentBadge(pct: number | null) {
  if (pct == null) return <Badge variant="outline">—</Badge>
  if (pct >= 100) return <Badge className="bg-emerald-600 hover:bg-emerald-600">{pct}%</Badge>
  if (pct >= 75) return <Badge variant="secondary">{pct}%</Badge>
  return <Badge variant="destructive">{pct}%</Badge>
}

export function TargetsQuotasView() {
  const [month, setMonth] = useState(() => monthKeyForDate(new Date()))
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<TargetRow[]>([])
  const [query, setQuery] = useState('')
  const [regionFilter, setRegionFilter] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    repName: '',
    region: '',
    targetVisits: '',
    targetSellInGhs: '',
    notes: '',
  })

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    repName: '',
    region: '',
    targetVisits: '',
    targetSellInGhs: '',
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sf/targets?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as { month: string; items: TargetRow[] }
      setItems(data.items)
    } catch {
      toast.error('Could not load targets & quotas')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const regions = useMemo(() => {
    const set = new Set<string>()
    for (const r of items) {
      if (r.region) set.add(r.region)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((r) => {
      if (regionFilter !== 'all' && (r.region ?? '') !== regionFilter) return false
      if (!q) return true
      return (
        r.repName.toLowerCase().includes(q) ||
        (r.region ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, query, regionFilter])

  const summary = useMemo(() => {
    let reps = 0
    let above100Visits = 0
    let above100SellIn = 0
    let targetVisits = 0
    let targetSellIn = 0
    let actualVisits = 0
    let actualSellIn = 0
    for (const r of items) {
      reps += 1
      targetVisits += r.targetVisits
      targetSellIn += r.targetSellInGhs
      actualVisits += r.actualVisitsMtd
      actualSellIn += r.actualSellInMtdGhs
      if ((r.visitsAttainmentPct ?? 0) >= 100) above100Visits += 1
      if ((r.sellInAttainmentPct ?? 0) >= 100) above100SellIn += 1
    }
    const visitsPct =
      targetVisits > 0 ? Math.min(999, Math.round((actualVisits / targetVisits) * 1000) / 10) : null
    const sellInPct =
      targetSellIn > 0
        ? Math.min(999, Math.round((actualSellIn / targetSellIn) * 1000) / 10)
        : null
    return {
      reps,
      above100Visits,
      above100SellIn,
      targetVisits,
      targetSellIn,
      actualVisits,
      actualSellIn,
      visitsPct,
      sellInPct,
    }
  }, [items])

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const repName = createForm.repName.trim()
    if (!repName) {
      toast.error('Rep name is required')
      return
    }
    const targetVisits = Number(createForm.targetVisits)
    const targetSellInGhs = Number(createForm.targetSellInGhs)
    if (
      !Number.isFinite(targetVisits) ||
      !Number.isInteger(targetVisits) ||
      targetVisits < 0 ||
      !Number.isFinite(targetSellInGhs) ||
      targetSellInGhs < 0
    ) {
      toast.error('Enter valid targets')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/sf/targets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month,
          repName,
          region: createForm.region.trim() || undefined,
          targetVisits,
          targetSellInGhs,
          notes: createForm.notes.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (res.status === 409) {
        toast.error('That rep already has a target for this month')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Target created')
      setCreateOpen(false)
      setCreateForm({
        repName: '',
        region: '',
        targetVisits: '',
        targetSellInGhs: '',
        notes: '',
      })
      void load()
    } catch {
      toast.error('Could not create target')
    } finally {
      setCreating(false)
    }
  }

  function openEdit(row: TargetRow) {
    setEditId(row.id)
    setEditForm({
      repName: row.repName,
      region: row.region ?? '',
      targetVisits: String(row.targetVisits),
      targetSellInGhs: String(row.targetSellInGhs),
      notes: row.notes ?? '',
    })
    setEditOpen(true)
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const repName = editForm.repName.trim()
    if (!repName) {
      toast.error('Rep name is required')
      return
    }
    const targetVisits = Number(editForm.targetVisits)
    const targetSellInGhs = Number(editForm.targetSellInGhs)
    if (
      !Number.isFinite(targetVisits) ||
      !Number.isInteger(targetVisits) ||
      targetVisits < 0 ||
      !Number.isFinite(targetSellInGhs) ||
      targetSellInGhs < 0
    ) {
      toast.error('Enter valid targets')
      return
    }

    setEditing(true)
    try {
      const res = await fetch(`/api/sf/targets/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repName,
          region: editForm.region.trim() ? editForm.region.trim() : null,
          targetVisits,
          targetSellInGhs,
          notes: editForm.notes.trim() ? editForm.notes.trim() : null,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Target updated')
      setEditOpen(false)
      setEditId(null)
      void load()
    } catch {
      toast.error('Could not update target')
    } finally {
      setEditing(false)
    }
  }

  const pageSubtitle = useMemo(() => {
    const dt = new Date(`${month}-01T12:00:00.000Z`)
    return `Month: ${format(dt, 'MMM yyyy')} · MTD actuals from completed shop visits (sf_visits)`
  }, [month])

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Targets & Quotas"
        description="Set monthly rep quotas and track MTD attainment using completed shop visits and sell-in logged on visits."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add target
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Add rep target</DialogTitle>
                    <DialogDescription>
                      Creates one target row per rep for this month ({month}). Actuals roll up from
                      completed visits.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="tq-rep">Rep name</Label>
                      <Input
                        id="tq-rep"
                        value={createForm.repName}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, repName: e.target.value }))
                        }
                        placeholder="Ama K."
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tq-region">Region (optional)</Label>
                      <Input
                        id="tq-region"
                        value={createForm.region}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, region: e.target.value }))
                        }
                        placeholder="Greater Accra"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="tq-visits">Target visits</Label>
                        <Input
                          id="tq-visits"
                          inputMode="numeric"
                          value={createForm.targetVisits}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, targetVisits: e.target.value }))
                          }
                          placeholder="80"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tq-sellin">Target sell-in (GHS)</Label>
                        <Input
                          id="tq-sellin"
                          inputMode="decimal"
                          value={createForm.targetSellInGhs}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, targetSellInGhs: e.target.value }))
                          }
                          placeholder="80000"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tq-notes">Notes (optional)</Label>
                      <Textarea
                        id="tq-notes"
                        value={createForm.notes}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, notes: e.target.value }))
                        }
                        placeholder="Key accounts, territory context, constraints…"
                        rows={3}
                        className="resize-y"
                      />
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
                        'Save target'
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{pageSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-2">
              <Label className="text-muted-foreground">Month</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Reps targeted</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{loading ? '—' : summary.reps}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Visits (MTD)</p>
            <p className="mt-2 text-xl font-bold tabular-nums sm:text-3xl">
              {loading ? '—' : `${summary.actualVisits} / ${summary.targetVisits}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Attainment: {summary.visitsPct == null ? '—' : `${summary.visitsPct}%`}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Sell-in (MTD)</p>
            <p className="mt-2 text-xl font-bold tabular-nums sm:text-3xl">
              {loading
                ? '—'
                : `${formatGhs(summary.actualSellIn)} / ${formatGhs(summary.targetSellIn)}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Attainment: {summary.sellInPct == null ? '—' : `${summary.sellInPct}%`}
            </p>
          </Card>
          <Card className="border-l-4 border-l-emerald-600 p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Above 100%</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : `${summary.above100Visits}V / ${summary.above100SellIn}S`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Reps above quota (Visits / Sell-in)</p>
          </Card>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="tq-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="tq-search"
              placeholder="Rep, region, notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2 sm:w-56">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Region
            </Label>
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All regions</SelectItem>
                {regions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">
              Rep quotas — {month}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No targets for this month</EmptyTitle>
                <EmptyDescription>
                  Add rep targets to start tracking quota attainment for visits and sell-in.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead className="hidden md:table-cell">Region</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Sell-in</TableHead>
                  <TableHead className="hidden lg:table-cell">Notes</TableHead>
                  <TableHead className="w-[52px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.repName}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {r.region ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-sm">
                          {r.actualVisitsMtd} / {r.targetVisits}
                        </div>
                        {attainmentBadge(r.visitsAttainmentPct)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-sm">
                          {formatGhs(r.actualSellInMtdGhs)} / {formatGhs(r.targetSellInGhs)}
                        </div>
                        {attainmentBadge(r.sellInAttainmentPct)}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-[320px] truncate text-sm text-muted-foreground lg:table-cell">
                      {r.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(r)}
                        aria-label={`Edit ${r.repName}`}
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
            No rows match your filters. Try another search or region.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit target</DialogTitle>
              <DialogDescription>
                Update the rep name, region, or monthly quotas. Month cannot be changed; create a
                new row for another month.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-rep">Rep name</Label>
                <Input
                  id="edit-rep"
                  value={editForm.repName}
                  onChange={(e) => setEditForm((f) => ({ ...f, repName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-region">Region</Label>
                <Input
                  id="edit-region"
                  value={editForm.region}
                  onChange={(e) => setEditForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Leave blank to clear"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-visits">Target visits</Label>
                  <Input
                    id="edit-visits"
                    inputMode="numeric"
                    value={editForm.targetVisits}
                    onChange={(e) => setEditForm((f) => ({ ...f, targetVisits: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sellin">Target sell-in (GHS)</Label>
                  <Input
                    id="edit-sellin"
                    inputMode="decimal"
                    value={editForm.targetSellInGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, targetSellInGhs: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="resize-y"
                  placeholder="Leave blank to clear"
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

