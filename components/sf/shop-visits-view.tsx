'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  CalendarClock,
  Download,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
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

type VisitStatus = 'scheduled' | 'completed' | 'cancelled'
type VisitType =
  | 'routine'
  | 'follow_up'
  | 'new_listing'
  | 'issue_resolution'
  | 'other'

type VisitRow = {
  id: string
  outletName: string
  area: string | null
  repName: string
  status: VisitStatus
  scheduledAt: string | null
  visitedAt: string | null
  sellInGhs: number | null
  visitType: VisitType | null
  durationMinutes: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type Stats = {
  total: number
  scheduled: number
  completed: number
  cancelled: number
  completed7d: number
  sellIn7dGhs: number
}

type OutletOption = {
  id: string
  name: string
  isActive: boolean
  region: string | null
}

const STATUS_OPTIONS: { value: VisitStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const VISIT_TYPE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: 'routine', label: 'Routine' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'new_listing', label: 'New listing' },
  { value: 'issue_resolution', label: 'Issue resolution' },
  { value: 'other', label: 'Other' },
]

function statusBadge(s: VisitStatus) {
  switch (s) {
    case 'completed':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Completed</Badge>
    case 'cancelled':
      return <Badge variant="secondary">Cancelled</Badge>
    default:
      return (
        <Badge variant="outline" className="border-blue-500/50 text-blue-700 dark:text-blue-300">
          Scheduled
        </Badge>
      )
  }
}

function visitTypeLabel(t: VisitType | null) {
  if (!t) return '—'
  return VISIT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t
}

function dateToIsoNoon(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

function emptyForm() {
  return {
    outletName: '',
    area: '',
    repName: '',
    status: 'scheduled' as VisitStatus,
    scheduledDate: '',
    visitedDate: '',
    sellInGhs: '',
    visitType: '' as '' | VisitType,
    durationMinutes: '',
    notes: '',
  }
}

export function ShopVisitsView() {
  const [loading, setLoading] = useState(true)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const [outletsLoading, setOutletsLoading] = useState(true)
  const [outlets, setOutlets] = useState<OutletOption[]>([])
  const [outletMode, setOutletMode] = useState<'select' | 'custom'>('select')
  const [editOutletMode, setEditOutletMode] = useState<'select' | 'custom'>('select')

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)

  const loadOutlets = useCallback(async () => {
    setOutletsLoading(true)
    try {
      const res = await fetch('/api/sf/outlets', { credentials: 'include' })
      if (res.status === 401) return
      if (!res.ok) throw new Error('Failed')
      const data = (await res.json()) as { outlets: OutletOption[] }
      const primary = Array.isArray(data.outlets) ? data.outlets : []
      if (primary.length > 0) {
        setOutlets(primary)
        return
      }

      // Fallback: suggest outlets from B2B Payments if registry is empty.
      const alt = await fetch('/api/sf/b2b-payments/outlets', { credentials: 'include' })
      if (!alt.ok) {
        setOutlets([])
        return
      }
      const altJson = (await alt.json()) as {
        outlets?: Array<{ outletName: string }>
      }
      const suggested =
        altJson.outlets
          ?.map((o, idx) => ({
            id: `b2b-${idx}-${o.outletName}`,
            name: String(o.outletName ?? '').trim(),
            isActive: true,
            region: null,
          }))
          .filter((o) => o.name.length > 0) ?? []
      setOutlets(suggested)
    } catch {
      setOutlets([])
    } finally {
      setOutletsLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q =
        statusFilter !== 'all'
          ? `?status=${encodeURIComponent(statusFilter)}`
          : ''
      const res = await fetch(`/api/sf/shop-visits${q}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as { visits: VisitRow[]; stats: Stats }
      setVisits(data.visits)
      setStats(data.stats)
    } catch {
      toast.error('Could not load shop visits')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadOutlets()
  }, [loadOutlets])

  // Default outlet selection (avoid "—")
  useEffect(() => {
    if (outletMode !== 'select') return
    if (outletsLoading) return
    if (outlets.length === 0) return
    if (form.outletName.trim()) return
    setForm((f) => ({ ...f, outletName: outlets[0]!.name }))
  }, [outletMode, outletsLoading, outlets, form.outletName])

  useEffect(() => {
    if (!editOpen) return
    if (editOutletMode !== 'select') return
    if (outletsLoading) return
    if (outlets.length === 0) return
    if (editForm.outletName.trim()) return
    setEditForm((f) => ({ ...f, outletName: outlets[0]!.name }))
  }, [editOpen, editOutletMode, outletsLoading, outlets, editForm.outletName])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return visits
    return visits.filter(
      (v) =>
        v.outletName.toLowerCase().includes(q) ||
        (v.area?.toLowerCase().includes(q) ?? false) ||
        v.repName.toLowerCase().includes(q) ||
        (v.notes?.toLowerCase().includes(q) ?? false),
    )
  }, [visits, query])

  function openEdit(v: VisitRow) {
    setEditId(v.id)
    setEditForm({
      outletName: v.outletName,
      area: v.area ?? '',
      repName: v.repName,
      status: v.status,
      scheduledDate: isoToDateInput(v.scheduledAt),
      visitedDate: isoToDateInput(v.visitedAt),
      sellInGhs: v.sellInGhs != null ? String(v.sellInGhs) : '',
      visitType: (v.visitType ?? '') as '' | VisitType,
      durationMinutes: v.durationMinutes != null ? String(v.durationMinutes) : '',
      notes: v.notes ?? '',
    })
    setEditOutletMode('select')
    setEditOpen(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const outletName = form.outletName.trim()
    const repName = form.repName.trim()
    if (!outletName || !repName) {
      toast.error('Outlet name and rep are required')
      return
    }
    if (form.status === 'scheduled' && !form.scheduledDate.trim()) {
      toast.error('Pick a scheduled date')
      return
    }
    const sellRaw = form.sellInGhs.trim()
    const sellInGhs =
      sellRaw === '' ? undefined : Number(sellRaw)
    if (sellRaw !== '' && (!Number.isFinite(sellInGhs) || sellInGhs! < 0)) {
      toast.error('Invalid sell-in amount')
      return
    }
    const durRaw = form.durationMinutes.trim()
    const durationMinutes =
      durRaw === '' ? undefined : Number(durRaw)
    if (
      durRaw !== '' &&
      (!Number.isFinite(durationMinutes) ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes! < 0)
    ) {
      toast.error('Duration must be a whole number of minutes')
      return
    }

    setCreating(true)
    try {
      const scheduledAt = dateToIsoNoon(form.scheduledDate)
      const visitedAt = dateToIsoNoon(form.visitedDate)
      const res = await fetch('/api/sf/shop-visits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          area: form.area.trim() || undefined,
          repName,
          status: form.status,
          scheduledAt,
          visitedAt,
          sellInGhs,
          visitType: form.visitType || undefined,
          durationMinutes,
          notes: form.notes.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Visit logged')
      setCreateOpen(false)
      setForm(emptyForm())
      setOutletMode('select')
      void load()
    } catch {
      toast.error('Could not create visit')
    } finally {
      setCreating(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const outletName = editForm.outletName.trim()
    const repName = editForm.repName.trim()
    if (!outletName || !repName) {
      toast.error('Outlet name and rep are required')
      return
    }
    if (editForm.status === 'scheduled' && !editForm.scheduledDate.trim()) {
      toast.error('Pick a scheduled date')
      return
    }
    const sellRaw = editForm.sellInGhs.trim()
    const sellInGhs = sellRaw === '' ? null : Number(sellRaw)
    if (sellRaw !== '' && (!Number.isFinite(sellInGhs) || sellInGhs! < 0)) {
      toast.error('Invalid sell-in amount')
      return
    }
    const durRaw = editForm.durationMinutes.trim()
    const durationMinutes = durRaw === '' ? null : Number(durRaw)
    if (
      durRaw !== '' &&
      (!Number.isFinite(durationMinutes) ||
        !Number.isInteger(durationMinutes) ||
        durationMinutes! < 0)
    ) {
      toast.error('Duration must be a whole number of minutes')
      return
    }

    setEditing(true)
    try {
      const scheduledAt = dateToIsoNoon(editForm.scheduledDate)
      const visitedAt = dateToIsoNoon(editForm.visitedDate)
      const res = await fetch(`/api/sf/shop-visits/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          area: editForm.area.trim() === '' ? null : editForm.area.trim(),
          repName,
          status: editForm.status,
          scheduledAt: scheduledAt ?? null,
          visitedAt: visitedAt ?? null,
          sellInGhs,
          visitType: editForm.visitType === '' ? null : editForm.visitType,
          durationMinutes,
          notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Visit updated')
      setEditOpen(false)
      setEditId(null)
      setEditOutletMode('select')
      void load()
    } catch {
      toast.error('Could not update visit')
    } finally {
      setEditing(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this visit record?')) return
    try {
      const res = await fetch(`/api/sf/shop-visits/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Removed')
      void load()
    } catch {
      toast.error('Could not delete')
    }
  }

  function exportCsv() {
    if (visits.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = [
      'outletName',
      'area',
      'repName',
      'status',
      'visitType',
      'scheduledAt',
      'visitedAt',
      'sellInGhs',
      'durationMinutes',
      'notes',
    ]
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      header.join(','),
      ...visits.map((v) =>
        [
          esc(v.outletName),
          v.area ? esc(v.area) : '',
          esc(v.repName),
          v.status,
          v.visitType ?? '',
          v.scheduledAt ?? '',
          v.visitedAt ?? '',
          v.sellInGhs ?? '',
          v.durationMinutes ?? '',
          v.notes ? esc(v.notes) : '',
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shop-visits-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Shop Visits"
        description="Plan and log field visits. Records feed the same pipeline as the SF dashboard (upcoming visits, 7-day visit counts, and rep sell-in)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || visits.length === 0}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Log visit
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(90vh,44rem)] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Log shop visit</DialogTitle>
                    <DialogDescription>
                      Scheduled rows appear on the SF dashboard “upcoming” list; completed visits
                      roll into 7-day KPIs when a visit date is set.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="sv-outlet">Outlet name</Label>
                      {outletMode === 'custom' ? (
                        <Input
                          id="sv-outlet"
                          value={form.outletName}
                          onChange={(e) => setForm((f) => ({ ...f, outletName: e.target.value }))}
                          placeholder="Type outlet name"
                          required
                        />
                      ) : (
                        <Select
                          value={form.outletName}
                          onValueChange={(v) => {
                            if (v === 'custom') {
                              setOutletMode('custom')
                              setForm((f) => ({ ...f, outletName: '' }))
                              return
                            }
                            setForm((f) => ({ ...f, outletName: v }))
                          }}
                        >
                          <SelectTrigger id="sv-outlet">
                            <SelectValue placeholder={outletsLoading ? 'Loading outlets…' : 'Select outlet'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Add custom…</SelectItem>
                            {outlets.map((o) => (
                              <SelectItem key={o.id} value={o.name}>
                                {o.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sv-area">Area (optional)</Label>
                      <Input
                        id="sv-area"
                        value={form.area}
                        onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                        placeholder="Community 5"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) =>
                            setForm((f) => ({ ...f, status: v as VisitStatus }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Visit type</Label>
                        <Select
                          value={form.visitType || 'none'}
                          onValueChange={(v) =>
                            setForm((f) => ({
                              ...f,
                              visitType: v === 'none' ? '' : (v as VisitType),
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            {VISIT_TYPE_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sv-rep">Rep name</Label>
                      <Input
                        id="sv-rep"
                        value={form.repName}
                        onChange={(e) => setForm((f) => ({ ...f, repName: e.target.value }))}
                        placeholder="Field rep"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sv-sched">Scheduled date</Label>
                        <Input
                          id="sv-sched"
                          type="date"
                          value={form.scheduledDate}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, scheduledDate: e.target.value }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {form.status === 'scheduled'
                            ? 'Required when status is scheduled'
                            : 'Optional (e.g. original plan date)'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sv-visit">Visit date</Label>
                        <Input
                          id="sv-visit"
                          type="date"
                          value={form.visitedDate}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, visitedDate: e.target.value }))
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          For completed: leave blank to use today
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="sv-sell">Sell-in (GHS)</Label>
                        <Input
                          id="sv-sell"
                          inputMode="decimal"
                          value={form.sellInGhs}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, sellInGhs: e.target.value }))
                          }
                          placeholder="Completed visits"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sv-dur">Duration (minutes)</Label>
                        <Input
                          id="sv-dur"
                          inputMode="numeric"
                          value={form.durationMinutes}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, durationMinutes: e.target.value }))
                          }
                          placeholder="Optional"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="sv-notes">Notes</Label>
                      <Textarea
                        id="sv-notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="SKU gaps, competitor activity, next actions…"
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
                        'Save visit'
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
        {stats ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Scheduled</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {stats.scheduled}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Completed (7d)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                {stats.completed7d}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Sell-in 7d</p>
              <p className="mt-1 text-lg font-bold tabular-nums sm:text-2xl">
                {formatGhs(stats.sellIn7dGhs)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Cancelled</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.cancelled}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total records</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total}</p>
            </Card>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2 sm:max-w-md">
            <Label htmlFor="sv-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="sv-search"
              placeholder="Outlet, area, rep, notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="w-full space-y-2 sm:w-48">
            <Label className="text-muted-foreground">Status filter</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : visits.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No visits yet</EmptyTitle>
                <EmptyDescription>
                  Log scheduled routes and completed calls. Stored in{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">sf_visits</code>{' '}
                  — the same collection the SF dashboard reads for upcoming visits and rep pulse.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead className="hidden md:table-cell">Area</TableHead>
                  <TableHead className="hidden sm:table-cell">Rep</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Scheduled</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Visited</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Sell-in</TableHead>
                  <TableHead className="w-[88px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="font-medium">{v.outletName}</div>
                      <div className="text-xs text-muted-foreground sm:hidden">{v.repName}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {v.area ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {v.area}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{v.repName}</TableCell>
                    <TableCell>{statusBadge(v.status)}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {visitTypeLabel(v.visitType)}
                    </TableCell>
                    <TableCell className="hidden text-right text-sm tabular-nums xl:table-cell">
                      {v.scheduledAt ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          <CalendarClock className="h-3 w-3 shrink-0 opacity-60" />
                          {format(new Date(v.scheduledAt), 'd MMM yyyy')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">
                      {v.visitedAt ? format(new Date(v.visitedAt), 'd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {v.sellInGhs != null ? formatGhs(v.sellInGhs) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(v)}
                          aria-label={`Edit ${v.outletName}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void remove(v.id)}
                          aria-label={`Delete ${v.outletName}`}
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

        {!loading && visits.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No rows match your search.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[min(90vh,44rem)] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit visit</DialogTitle>
              <DialogDescription>
                Adjust status, dates, or sell-in. Dashboard KPIs use completed visits with a visit
                date in the last 7 days.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-sv-outlet">Outlet name</Label>
                {editOutletMode === 'custom' ? (
                  <Input
                    id="edit-sv-outlet"
                    value={editForm.outletName}
                    onChange={(e) => setEditForm((f) => ({ ...f, outletName: e.target.value }))}
                    placeholder="Type outlet name"
                    required
                  />
                ) : (
                  <Select
                    value={editForm.outletName}
                    onValueChange={(v) => {
                      if (v === 'custom') {
                        setEditOutletMode('custom')
                        setEditForm((f) => ({ ...f, outletName: '' }))
                        return
                      }
                      setEditForm((f) => ({ ...f, outletName: v }))
                    }}
                  >
                    <SelectTrigger id="edit-sv-outlet">
                      <SelectValue placeholder={outletsLoading ? 'Loading outlets…' : 'Select outlet'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Add custom…</SelectItem>
                      {outlets.map((o) => (
                        <SelectItem key={o.id} value={o.name}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sv-area">Area</Label>
                <Input
                  id="edit-sv-area"
                  value={editForm.area}
                  onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))}
                  placeholder="Leave blank to clear"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, status: v as VisitStatus }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Visit type</Label>
                  <Select
                    value={editForm.visitType || 'none'}
                    onValueChange={(v) =>
                      setEditForm((f) => ({
                        ...f,
                        visitType: v === 'none' ? '' : (v as VisitType),
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {VISIT_TYPE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sv-rep">Rep name</Label>
                <Input
                  id="edit-sv-rep"
                  value={editForm.repName}
                  onChange={(e) => setEditForm((f) => ({ ...f, repName: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-sv-sched">Scheduled date</Label>
                  <Input
                    id="edit-sv-sched"
                    type="date"
                    value={editForm.scheduledDate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, scheduledDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sv-visit">Visit date</Label>
                  <Input
                    id="edit-sv-visit"
                    type="date"
                    value={editForm.visitedDate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, visitedDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-sv-sell">Sell-in (GHS)</Label>
                  <Input
                    id="edit-sv-sell"
                    inputMode="decimal"
                    value={editForm.sellInGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, sellInGhs: e.target.value }))
                    }
                    placeholder="Clear field to remove"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sv-dur">Duration (minutes)</Label>
                  <Input
                    id="edit-sv-dur"
                    inputMode="numeric"
                    value={editForm.durationMinutes}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, durationMinutes: e.target.value }))
                    }
                    placeholder="Clear to remove"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sv-notes">Notes</Label>
                <Textarea
                  id="edit-sv-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="resize-y"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editing}>
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
