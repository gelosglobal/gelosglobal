'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
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

type CollectionRow = {
  id: string
  amountGhs: number
  collectedAt: string
  note: string | null
  outletName: string | null
  repName: string | null
  createdAt: string
}

type B2bPaymentsKpis = {
  periodDays: number
  periodStart: string
  periodEnd: string
  invoicedGhs: number
  collectedGhs: number
  outstandingGhs: number
  collectionRatePct: number | null
  totalLoggedEntries: number
}

const PERIOD_OPTIONS = [7, 14, 30, 60, 90] as const

function dateToIsoNoon(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  const [y, m, d] = v.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function isoToDateInput(iso: string): string {
  return iso.slice(0, 10)
}

function emptyForm() {
  return {
    amountGhs: '',
    collectedDate: new Date().toISOString().slice(0, 10),
    outletName: '',
    repName: '',
    note: '',
  }
}

export function B2bPaymentsView() {
  const [loading, setLoading] = useState(true)
  const [collections, setCollections] = useState<CollectionRow[]>([])
  const [kpis, setKpis] = useState<B2bPaymentsKpis | null>(null)
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [query, setQuery] = useState('')

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
      const q = `?periodDays=${encodeURIComponent(String(periodDays))}`
      const res = await fetch(`/api/sf/b2b-payments${q}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as {
        collections: CollectionRow[]
        kpis: B2bPaymentsKpis
      }
      setCollections(data.collections)
      setKpis(data.kpis)
    } catch {
      toast.error('Could not load B2B payments')
    } finally {
      setLoading(false)
    }
  }, [periodDays])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return collections
    return collections.filter(
      (c) =>
        String(c.amountGhs).includes(q) ||
        (c.outletName?.toLowerCase().includes(q) ?? false) ||
        (c.repName?.toLowerCase().includes(q) ?? false) ||
        (c.note?.toLowerCase().includes(q) ?? false),
    )
  }, [collections, query])

  function openEdit(c: CollectionRow) {
    setEditId(c.id)
    setEditForm({
      amountGhs: String(c.amountGhs),
      collectedDate: isoToDateInput(c.collectedAt),
      outletName: c.outletName ?? '',
      repName: c.repName ?? '',
      note: c.note ?? '',
    })
    setEditOpen(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(form.amountGhs)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    const collectedAt = dateToIsoNoon(form.collectedDate)
    if (!collectedAt) {
      toast.error('Pick a collection date')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/sf/b2b-payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountGhs: amt,
          collectedAt,
          outletName: form.outletName.trim() || undefined,
          repName: form.repName.trim() || undefined,
          note: form.note.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Collection logged')
      setCreateOpen(false)
      setForm(emptyForm())
      void load()
    } catch {
      toast.error('Could not log collection')
    } finally {
      setCreating(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const amt = Number(editForm.amountGhs)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    const collectedAt = dateToIsoNoon(editForm.collectedDate)
    if (!collectedAt) {
      toast.error('Pick a collection date')
      return
    }
    setEditing(true)
    try {
      const res = await fetch(`/api/sf/b2b-payments/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountGhs: amt,
          collectedAt,
          outletName:
            editForm.outletName.trim() === '' ? null : editForm.outletName.trim(),
          repName: editForm.repName.trim() === '' ? null : editForm.repName.trim(),
          note: editForm.note.trim() === '' ? null : editForm.note.trim(),
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Update failed')
      toast.success('Updated')
      setEditOpen(false)
      setEditId(null)
      void load()
    } catch {
      toast.error('Could not update')
    } finally {
      setEditing(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this collection record?')) return
    try {
      const res = await fetch(`/api/sf/b2b-payments/${id}`, {
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
    if (collections.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = [
      'amountGhs',
      'collectedAt',
      'outletName',
      'repName',
      'note',
      'createdAt',
    ]
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      header.join(','),
      ...collections.map((c) =>
        [
          c.amountGhs,
          c.collectedAt,
          c.outletName ? esc(c.outletName) : '',
          c.repName ? esc(c.repName) : '',
          c.note ? esc(c.note) : '',
          c.createdAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `b2b-cash-collections-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="B2B Payments"
        description="Top-line KPIs use a rolling window: Invoiced = B2B portal orders, Collected = logged trade cash, Outstanding = manual AR from Finance Layer. Collection rate is collected ÷ invoiced. Log cash below; portal orders come from the Orders Engine."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="b2b-period" className="sr-only">
                KPI period
              </Label>
              <Select
                value={String(periodDays)}
                onValueChange={(v) => setPeriodDays(Number(v))}
              >
                <SelectTrigger id="b2b-period" className="h-9 w-[148px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Last {d} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || collections.length === 0}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/dtc/finance-layer">
                Finance Layer
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Log collection
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Log B2B cash collection</DialogTitle>
                    <DialogDescription>
                      Record cash or equivalent collected at an outlet. Same data as Finance Layer →
                      Log B2B cash.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="b2b-amt">Amount (GHS)</Label>
                      <Input
                        id="b2b-amt"
                        inputMode="decimal"
                        value={form.amountGhs}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, amountGhs: e.target.value }))
                        }
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b2b-date">Collection date</Label>
                      <Input
                        id="b2b-date"
                        type="date"
                        value={form.collectedDate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, collectedDate: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="b2b-outlet">Outlet (optional)</Label>
                        <Input
                          id="b2b-outlet"
                          value={form.outletName}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, outletName: e.target.value }))
                          }
                          placeholder="Customer / store name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="b2b-rep">Rep (optional)</Label>
                        <Input
                          id="b2b-rep"
                          value={form.repName}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, repName: e.target.value }))
                          }
                          placeholder="Who collected"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b2b-note">Note</Label>
                      <Textarea
                        id="b2b-note"
                        value={form.note}
                        onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                        placeholder="Invoice ref, payment type…"
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
                        'Save'
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
        {kpis ? (
          <div className="space-y-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Invoiced</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
                  {formatGhs(kpis.invoicedGhs)}
                </p>
                <p className="text-xs text-muted-foreground">
                  B2B portal orders · last {kpis.periodDays} days
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Collected</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
                  {formatGhs(kpis.collectedGhs)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Logged trade cash · same window
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Outstanding</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
                  {formatGhs(kpis.outstandingGhs)}
                </p>
                <Button variant="link" className="h-auto p-0 text-xs" asChild>
                  <Link href="/dtc/finance-layer">Adjust in Finance Layer</Link>
                </Button>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Collection rate
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
                  {kpis.collectionRatePct != null
                    ? `${kpis.collectionRatePct.toLocaleString('en-GH', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 1,
                      })}%`
                    : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {kpis.invoicedGhs > 0
                    ? 'Collected ÷ invoiced'
                    : 'No portal invoicing in this window'}
                </p>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground">
              Cash ledger: {kpis.totalLoggedEntries}{' '}
              {kpis.totalLoggedEntries === 1 ? 'entry' : 'entries'} logged (all time).
            </p>
          </div>
        ) : null}

        <div className="max-w-md space-y-2">
          <Label htmlFor="b2b-search" className="text-muted-foreground">
            Search
          </Label>
          <Input
            id="b2b-search"
            placeholder="Amount, outlet, rep, note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Card className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : collections.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No cash collections yet</EmptyTitle>
                <EmptyDescription>
                  Log trade receipts here or from Finance Layer. Rows are stored in MongoDB{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    b2b_cash_collections
                  </code>
                  .
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Collected</TableHead>
                  <TableHead className="hidden md:table-cell">Outlet</TableHead>
                  <TableHead className="hidden lg:table-cell">Rep</TableHead>
                  <TableHead className="hidden xl:table-cell">Note</TableHead>
                  <TableHead className="w-[88px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatGhs(c.amountGhs)}
                      <div className="text-xs font-normal text-muted-foreground sm:hidden">
                        {format(new Date(c.collectedAt), 'd MMM yyyy')}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {format(new Date(c.collectedAt), 'd MMM yyyy')}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.outletName ?? '—'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {c.repName ?? '—'}
                    </TableCell>
                    <TableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground xl:table-cell">
                      {c.note ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(c)}
                          aria-label="Edit collection"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void remove(c.id)}
                          aria-label="Delete collection"
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

        {!loading && collections.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No rows match your search.
          </p>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit collection</DialogTitle>
              <DialogDescription>Correct amount, date, or attribution.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-b2b-amt">Amount (GHS)</Label>
                <Input
                  id="edit-b2b-amt"
                  inputMode="decimal"
                  value={editForm.amountGhs}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, amountGhs: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-b2b-date">Collection date</Label>
                <Input
                  id="edit-b2b-date"
                  type="date"
                  value={editForm.collectedDate}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, collectedDate: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-outlet">Outlet</Label>
                  <Input
                    id="edit-b2b-outlet"
                    value={editForm.outletName}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, outletName: e.target.value }))
                    }
                    placeholder="Clear to remove"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-rep">Rep</Label>
                  <Input
                    id="edit-b2b-rep"
                    value={editForm.repName}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, repName: e.target.value }))
                    }
                    placeholder="Clear to remove"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-b2b-note">Note</Label>
                <Textarea
                  id="edit-b2b-note"
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
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
