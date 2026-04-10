'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Download, Loader2, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { formatGhs } from '@/lib/dtc-orders'

type ScoutOutletStatus = 'lead' | 'qualified' | 'in_review' | 'won' | 'lost'
type ScoutPriority = 'low' | 'medium' | 'high'

type OutletRow = {
  id: string
  name: string
  area: string
  contactName: string | null
  contactPhone: string | null
  notes: string | null
  estimatedMonthlyVolumeGhs: number | null
  status: ScoutOutletStatus
  priority: ScoutPriority
  scoutedBy: string
  scoutedAt: string
  latitude: number | null
  longitude: number | null
  createdAt: string
  updatedAt: string
}

type Stats = {
  total: number
  pipelineOpen: number
  byStatus: Record<ScoutOutletStatus, number>
}

const STATUS_OPTIONS: { value: ScoutOutletStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'in_review', label: 'In review' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
]

const PRIORITY_OPTIONS: { value: ScoutPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function statusBadge(s: ScoutOutletStatus) {
  switch (s) {
    case 'won':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Won</Badge>
    case 'lost':
      return <Badge variant="secondary">Lost</Badge>
    case 'qualified':
      return <Badge className="bg-blue-600 hover:bg-blue-600">Qualified</Badge>
    case 'in_review':
      return <Badge variant="outline">In review</Badge>
    default:
      return <Badge variant="outline">Lead</Badge>
  }
}

function priorityBadge(p: ScoutPriority) {
  if (p === 'high') return <Badge variant="destructive">High</Badge>
  if (p === 'medium') return <Badge variant="secondary">Medium</Badge>
  return <Badge variant="outline">Low</Badge>
}

function emptyForm() {
  return {
    name: '',
    area: '',
    contactName: '',
    contactPhone: '',
    notes: '',
    estimatedMonthlyVolumeGhs: '',
    status: 'lead' as ScoutOutletStatus,
    priority: 'medium' as ScoutPriority,
    scoutedBy: '',
    scoutedAt: new Date().toISOString().slice(0, 10),
  }
}

export function OutletScoutingView() {
  const [loading, setLoading] = useState(true)
  const [outlets, setOutlets] = useState<OutletRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

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
      const q =
        statusFilter !== 'all' ? `?status=${encodeURIComponent(statusFilter)}` : ''
      const res = await fetch(`/api/sf/scouted-outlets${q}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as {
        outlets: OutletRow[]
        stats: Stats
      }
      setOutlets(data.outlets)
      setStats(data.stats)
    } catch {
      toast.error('Could not load scouted outlets')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return outlets
    return outlets.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.area.toLowerCase().includes(q) ||
        (o.contactName?.toLowerCase().includes(q) ?? false) ||
        o.scoutedBy.toLowerCase().includes(q),
    )
  }, [outlets, query])

  function openEdit(o: OutletRow) {
    setEditId(o.id)
    setEditForm({
      name: o.name,
      area: o.area,
      contactName: o.contactName ?? '',
      contactPhone: o.contactPhone ?? '',
      notes: o.notes ?? '',
      estimatedMonthlyVolumeGhs:
        o.estimatedMonthlyVolumeGhs != null ? String(o.estimatedMonthlyVolumeGhs) : '',
      status: o.status,
      priority: o.priority,
      scoutedBy: o.scoutedBy,
      scoutedAt: o.scoutedAt.slice(0, 10),
    })
    setEditOpen(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = form.name.trim()
    const area = form.area.trim()
    const scoutedBy = form.scoutedBy.trim()
    if (!name || !area || !scoutedBy) {
      toast.error('Name, area, and scout name are required')
      return
    }
    const vol =
      form.estimatedMonthlyVolumeGhs.trim() === ''
        ? undefined
        : Number(form.estimatedMonthlyVolumeGhs)
    if (form.estimatedMonthlyVolumeGhs.trim() !== '' && (!Number.isFinite(vol) || vol! < 0)) {
      toast.error('Invalid estimated volume')
      return
    }
    setCreating(true)
    try {
      const [y, m, d] = form.scoutedAt.split('-').map(Number)
      const scoutedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString()
      const res = await fetch('/api/sf/scouted-outlets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          area,
          contactName: form.contactName.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          notes: form.notes.trim() || undefined,
          estimatedMonthlyVolumeGhs: vol,
          status: form.status,
          priority: form.priority,
          scoutedBy,
          scoutedAt,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Outlet logged')
      setCreateOpen(false)
      setForm(emptyForm())
      void load()
    } catch {
      toast.error('Could not create outlet')
    } finally {
      setCreating(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const name = editForm.name.trim()
    const area = editForm.area.trim()
    const scoutedBy = editForm.scoutedBy.trim()
    if (!name || !area || !scoutedBy) {
      toast.error('Name, area, and scout name are required')
      return
    }
    const volRaw = editForm.estimatedMonthlyVolumeGhs.trim()
    const estimatedMonthlyVolumeGhs =
      volRaw === '' ? null : Number(volRaw)
    if (volRaw !== '' && (!Number.isFinite(estimatedMonthlyVolumeGhs) || estimatedMonthlyVolumeGhs! < 0)) {
      toast.error('Invalid estimated volume')
      return
    }
    setEditing(true)
    try {
      const [y, m, d] = editForm.scoutedAt.split('-').map(Number)
      const scoutedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString()
      const res = await fetch(`/api/sf/scouted-outlets/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          area,
          contactName: editForm.contactName.trim() || null,
          contactPhone: editForm.contactPhone.trim() || null,
          notes: editForm.notes.trim() || null,
          estimatedMonthlyVolumeGhs,
          status: editForm.status,
          priority: editForm.priority,
          scoutedBy,
          scoutedAt,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Outlet updated')
      setEditOpen(false)
      setEditId(null)
      void load()
    } catch {
      toast.error('Could not update outlet')
    } finally {
      setEditing(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this scouted outlet?')) return
    try {
      const res = await fetch(`/api/sf/scouted-outlets/${id}`, {
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
    if (outlets.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = [
      'name',
      'area',
      'contactName',
      'contactPhone',
      'status',
      'priority',
      'estimatedMonthlyVolumeGhs',
      'scoutedBy',
      'scoutedAt',
      'notes',
    ]
    const lines = [
      header.join(','),
      ...outlets.map((o) =>
        [
          `"${o.name.replace(/"/g, '""')}"`,
          `"${o.area.replace(/"/g, '""')}"`,
          o.contactName ? `"${o.contactName.replace(/"/g, '""')}"` : '',
          o.contactPhone ? `"${o.contactPhone.replace(/"/g, '""')}"` : '',
          o.status,
          o.priority,
          o.estimatedMonthlyVolumeGhs ?? '',
          `"${o.scoutedBy.replace(/"/g, '""')}"`,
          o.scoutedAt,
          o.notes ? `"${o.notes.replace(/"/g, '""')}"` : '',
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `outlet-scouting-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Outlet Scouting"
        description="Capture and prioritise new retail opportunities before they enter the active route. Track status from lead through won or lost."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || outlets.length === 0}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Log outlet
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Log scouted outlet</DialogTitle>
                    <DialogDescription>
                      Add a prospect location. You can refine status and priority as the deal moves.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="scout-name">Outlet name</Label>
                      <Input
                        id="scout-name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Elite Pharmacy — Osu"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scout-area">Area / neighbourhood</Label>
                      <Input
                        id="scout-area"
                        value={form.area}
                        onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
                        placeholder="Osu, Accra"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="scout-contact">Contact name</Label>
                        <Input
                          id="scout-contact"
                          value={form.contactName}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, contactName: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scout-phone">Phone</Label>
                        <Input
                          id="scout-phone"
                          value={form.contactPhone}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, contactPhone: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) =>
                            setForm((f) => ({ ...f, status: v as ScoutOutletStatus }))
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
                        <Label>Priority</Label>
                        <Select
                          value={form.priority}
                          onValueChange={(v) =>
                            setForm((f) => ({ ...f, priority: v as ScoutPriority }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scout-vol">Est. monthly sell-in (GHS)</Label>
                      <Input
                        id="scout-vol"
                        inputMode="decimal"
                        value={form.estimatedMonthlyVolumeGhs}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, estimatedMonthlyVolumeGhs: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="scout-by">Scouted by</Label>
                        <Input
                          id="scout-by"
                          value={form.scoutedBy}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, scoutedBy: e.target.value }))
                          }
                          placeholder="Rep name"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scout-date">Scout date</Label>
                        <Input
                          id="scout-date"
                          type="date"
                          value={form.scoutedAt}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, scoutedAt: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scout-notes">Notes</Label>
                      <Input
                        id="scout-notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Footfall, category, next step…"
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
                        'Save outlet'
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Pipeline</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.pipelineOpen}</p>
              <p className="text-xs text-muted-foreground">Lead + qualified + in review</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Won</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                {stats.byStatus.won}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Lost</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.byStatus.lost}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total logged</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total}</p>
            </Card>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2 sm:max-w-md">
            <Label htmlFor="scout-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="scout-search"
              placeholder="Name, area, contact, scout…"
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
          ) : outlets.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No outlets yet</EmptyTitle>
                <EmptyDescription>
                  Log your first prospect with the button above. Data is stored in{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">sf_scouted_outlets</code>.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead className="hidden md:table-cell">Area</TableHead>
                  <TableHead className="hidden lg:table-cell">Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Priority</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Est. / mo</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Scouted</TableHead>
                  <TableHead className="w-[88px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className="font-medium">{o.name}</div>
                      <div className="text-xs text-muted-foreground md:hidden">{o.area}</div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {o.area}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm">{o.contactName ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{o.contactPhone ?? ''}</div>
                    </TableCell>
                    <TableCell>{statusBadge(o.status)}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {priorityBadge(o.priority)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums xl:table-cell">
                      {o.estimatedMonthlyVolumeGhs != null
                        ? formatGhs(o.estimatedMonthlyVolumeGhs)
                        : '—'}
                    </TableCell>
                    <TableCell className="hidden text-right text-sm text-muted-foreground sm:table-cell">
                      {format(new Date(o.scoutedAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(o)}
                          aria-label={`Edit ${o.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void remove(o.id)}
                          aria-label={`Delete ${o.name}`}
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

        {!loading && outlets.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No rows match your search.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit outlet</DialogTitle>
              <DialogDescription>Update status, contacts, or estimates.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Outlet name</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-area">Area</Label>
                <Input
                  id="edit-area"
                  value={editForm.area}
                  onChange={(e) => setEditForm((f) => ({ ...f, area: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-contact">Contact name</Label>
                  <Input
                    id="edit-contact"
                    value={editForm.contactName}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, contactName: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.contactPhone}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, contactPhone: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, status: v as ScoutOutletStatus }))
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
                  <Label>Priority</Label>
                  <Select
                    value={editForm.priority}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, priority: v as ScoutPriority }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-vol">Est. monthly sell-in (GHS)</Label>
                <Input
                  id="edit-vol"
                  inputMode="decimal"
                  value={editForm.estimatedMonthlyVolumeGhs}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, estimatedMonthlyVolumeGhs: e.target.value }))
                  }
                  placeholder="Leave blank to clear"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-by">Scouted by</Label>
                  <Input
                    id="edit-by"
                    value={editForm.scoutedBy}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, scoutedBy: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Scout date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editForm.scoutedAt}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, scoutedAt: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Input
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
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
