'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  CheckCircle2,
  Circle,
  Download,
  Loader2,
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
import { cn } from '@/lib/utils'

type TaskStatus = 'open' | 'done'

type TaskRow = {
  id: string
  title: string
  outletName: string
  status: TaskStatus
  dueAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type Stats = {
  total: number
  open: number
  done: number
  overdueOpen: number
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
]

function statusBadge(s: TaskStatus) {
  if (s === 'done') {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Done</Badge>
  }
  return (
    <Badge variant="outline" className="border-amber-500/50 text-amber-800 dark:text-amber-200">
      Open
    </Badge>
  )
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
    title: '',
    outletName: '',
    status: 'open' as TaskStatus,
    dueDate: '',
    notes: '',
  }
}

function isOverdueOpen(row: TaskRow, now: Date) {
  if (row.status !== 'open' || !row.dueAt) return false
  return new Date(row.dueAt) < now
}

export function PosmTrackerView() {
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<TaskRow[]>([])
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
        statusFilter !== 'all'
          ? `?status=${encodeURIComponent(statusFilter)}`
          : ''
      const res = await fetch(`/api/sf/posm-tasks${q}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as { tasks: TaskRow[]; stats: Stats }
      setTasks(data.tasks)
      setStats(data.stats)
    } catch {
      toast.error('Could not load POSM tasks')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.outletName.toLowerCase().includes(q) ||
        (t.notes?.toLowerCase().includes(q) ?? false),
    )
  }, [tasks, query])

  function openEdit(t: TaskRow) {
    setEditId(t.id)
    setEditForm({
      title: t.title,
      outletName: t.outletName,
      status: t.status,
      dueDate: isoToDateInput(t.dueAt),
      notes: t.notes ?? '',
    })
    setEditOpen(true)
  }

  async function markDone(id: string) {
    try {
      const res = await fetch(`/api/sf/posm-tasks/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Marked done')
      void load()
    } catch {
      toast.error('Could not update task')
    }
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const title = form.title.trim()
    const outletName = form.outletName.trim()
    if (!title || !outletName) {
      toast.error('Title and outlet are required')
      return
    }
    setCreating(true)
    try {
      const dueAt = dateToIsoNoon(form.dueDate)
      const res = await fetch('/api/sf/posm-tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          outletName,
          status: form.status,
          dueAt,
          notes: form.notes.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Task created')
      setCreateOpen(false)
      setForm(emptyForm())
      void load()
    } catch {
      toast.error('Could not create task')
    } finally {
      setCreating(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const title = editForm.title.trim()
    const outletName = editForm.outletName.trim()
    if (!title || !outletName) {
      toast.error('Title and outlet are required')
      return
    }
    setEditing(true)
    try {
      const dueAt = dateToIsoNoon(editForm.dueDate)
      const res = await fetch(`/api/sf/posm-tasks/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          outletName,
          status: editForm.status,
          dueAt: dueAt ?? null,
          notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Task updated')
      setEditOpen(false)
      setEditId(null)
      void load()
    } catch {
      toast.error('Could not update task')
    } finally {
      setEditing(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this POSM task?')) return
    try {
      const res = await fetch(`/api/sf/posm-tasks/${id}`, {
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
    if (tasks.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = ['title', 'outletName', 'status', 'dueAt', 'notes', 'createdAt']
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      header.join(','),
      ...tasks.map((t) =>
        [
          esc(t.title),
          esc(t.outletName),
          t.status,
          t.dueAt ?? '',
          t.notes ? esc(t.notes) : '',
          t.createdAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `posm-tasks-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="POSM Tracker"
        description="Track point-of-sale material installs, refits, and follow-ups by outlet. Open tasks and overdue items feed the SF dashboard KPIs and alerts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || tasks.length === 0}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  New task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Add POSM task</DialogTitle>
                    <DialogDescription>
                      Examples: shelf strip refresh, counter display install, poster replacement.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="posm-title">Task title</Label>
                      <Input
                        id="posm-title"
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="Replace faded wobbler — drinks aisle"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="posm-outlet">Outlet</Label>
                      <Input
                        id="posm-outlet"
                        value={form.outletName}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, outletName: e.target.value }))
                        }
                        placeholder="Outlet name as on the route"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) =>
                            setForm((f) => ({ ...f, status: v as TaskStatus }))
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
                        <Label htmlFor="posm-due">Due date</Label>
                        <Input
                          id="posm-due"
                          type="date"
                          value={form.dueDate}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, dueDate: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="posm-notes">Notes</Label>
                      <Textarea
                        id="posm-notes"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="SKUs, quantities, access constraints…"
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
                        'Save task'
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
              <p className="text-xs font-medium uppercase text-muted-foreground">Open</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
                {stats.open}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Overdue (open)</p>
              <p
                className={cn(
                  'mt-1 text-2xl font-bold tabular-nums',
                  stats.overdueOpen > 0 && 'text-destructive',
                )}
              >
                {stats.overdueOpen}
              </p>
              <p className="text-xs text-muted-foreground">Due date passed &amp; still open</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Done</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                {stats.done}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium uppercase text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total}</p>
            </Card>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-2 sm:max-w-md">
            <Label htmlFor="posm-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="posm-search"
              placeholder="Title, outlet, notes…"
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
          ) : tasks.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No POSM tasks yet</EmptyTitle>
                <EmptyDescription>
                  Create tasks for merchandising work in the field. Data lives in{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">sf_posm_tasks</code>
                  — the same collection the SF dashboard uses for open counts and overdue alerts.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="hidden sm:table-cell">Outlet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Due</TableHead>
                  <TableHead className="w-[140px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const overdue = isOverdueOpen(t, new Date())
                  return (
                    <TableRow
                      key={t.id}
                      className={cn(overdue && 'bg-destructive/5 dark:bg-destructive/10')}
                    >
                      <TableCell>
                        <div className="font-medium">{t.title}</div>
                        {t.notes ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground sm:max-w-md">
                            {t.notes}
                          </p>
                        ) : null}
                        <div className="text-xs text-muted-foreground sm:hidden">{t.outletName}</div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {t.outletName}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {statusBadge(t.status)}
                          {overdue ? (
                            <Badge variant="destructive" className="text-xs">
                              Overdue
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right text-sm tabular-nums text-muted-foreground md:table-cell">
                        {t.dueAt ? format(new Date(t.dueAt), 'd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          {t.status === 'open' ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-600"
                              onClick={() => void markDone(t.id)}
                              aria-label={`Mark done: ${t.title}`}
                              title="Mark done"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <span className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground/40">
                              <Circle className="h-4 w-4" />
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(t)}
                            aria-label={`Edit ${t.title}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => void remove(t.id)}
                            aria-label={`Delete ${t.title}`}
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

        {!loading && tasks.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No rows match your search.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit POSM task</DialogTitle>
              <DialogDescription>
                Reopen by setting status to Open, or clear the due date to remove a deadline.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-posm-title">Task title</Label>
                <Input
                  id="edit-posm-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-posm-outlet">Outlet</Label>
                <Input
                  id="edit-posm-outlet"
                  value={editForm.outletName}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, outletName: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) =>
                      setEditForm((f) => ({ ...f, status: v as TaskStatus }))
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
                  <Label htmlFor="edit-posm-due">Due date</Label>
                  <Input
                    id="edit-posm-due"
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, dueDate: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">Clear date in browser, then save to remove due</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-posm-notes">Notes</Label>
                <Textarea
                  id="edit-posm-notes"
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
