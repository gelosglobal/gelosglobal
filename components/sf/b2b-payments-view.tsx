'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Download,
  Eye,
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
  outletName: string
  invoiceNumber: string
  amountGhs: number
  discountGhs: number
  paidGhs: number
  balanceGhs: number
  items: { name: string; sku?: string; qty: number; unitPriceGhs: number }[]
  dueAt: string | null
  repName: string | null
  status: 'paid' | 'overdue' | 'open'
  notes: string | null
  createdAt: string
  updatedAt: string
}

type B2bPaymentsKpis = {
  invoicedGhs: number
  paidGhs: number
  outstandingGhs: number
  overdueGhs: number
  collectionRatePct: number | null
  totalInvoices: number
}

const PERIOD_OPTIONS = [7, 14, 30, 60, 90] as const

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
    invoiceNumber: '',
    amountGhs: '',
    discountGhs: '',
    paidGhs: '',
    dueDate: '',
    repName: '',
    notes: '',
    items: [] as DraftItem[],
  }
}

type DraftItem = {
  name: string
  sku: string
  qty: string
  unitPriceGhs: string
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

  const [itemsOpen, setItemsOpen] = useState(false)
  const [itemsTitle, setItemsTitle] = useState<string>('')
  const [itemsForModal, setItemsForModal] = useState<CollectionRow['items']>([])

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
        invoices: CollectionRow[]
        kpis: B2bPaymentsKpis
      }
      setCollections(data.invoices)
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
        c.outletName.toLowerCase().includes(q) ||
        c.invoiceNumber.toLowerCase().includes(q) ||
        String(c.amountGhs).includes(q) ||
        String(c.paidGhs).includes(q) ||
        String(c.balanceGhs).includes(q) ||
        (c.repName?.toLowerCase().includes(q) ?? false) ||
        (c.notes?.toLowerCase().includes(q) ?? false) ||
        c.status.toLowerCase().includes(q),
    )
  }, [collections, query])

  function openEdit(c: CollectionRow) {
    setEditId(c.id)
    setEditForm({
      outletName: c.outletName,
      invoiceNumber: c.invoiceNumber,
      amountGhs: String(c.amountGhs),
      discountGhs: c.discountGhs ? String(c.discountGhs) : '',
      paidGhs: String(c.paidGhs),
      dueDate: isoToDateInput(c.dueAt),
      repName: c.repName ?? '',
      notes: c.notes ?? '',
      items:
        c.items && c.items.length > 0
          ? c.items.map(
              (it) =>
                ({
                  name: it.name,
                  sku: it.sku ?? '',
                  qty: String(it.qty),
                  unitPriceGhs: String(it.unitPriceGhs),
                }) satisfies DraftItem,
            )
          : [],
    })
    setEditOpen(true)
  }

  function openItems(c: CollectionRow) {
    setItemsTitle(`${c.outletName} · ${c.invoiceNumber}`)
    setItemsForModal(c.items ?? [])
    setItemsOpen(true)
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault()
    const outletName = form.outletName.trim()
    const invoiceNumber = form.invoiceNumber.trim()
    if (!outletName || !invoiceNumber) {
      toast.error('Outlet and invoice are required')
      return
    }
    const amountGhs = Number(form.amountGhs)
    const discountGhs = form.discountGhs.trim() === '' ? 0 : Number(form.discountGhs)
    const paidGhs = form.paidGhs.trim() === '' ? 0 : Number(form.paidGhs)
    if (
      !Number.isFinite(amountGhs) ||
      amountGhs < 0 ||
      !Number.isFinite(discountGhs) ||
      discountGhs < 0 ||
      !Number.isFinite(paidGhs) ||
      paidGhs < 0
    ) {
      toast.error('Enter valid numbers for amount and paid')
      return
    }
    const dueAt = form.dueDate.trim() ? dateToIsoNoon(form.dueDate) : undefined
    const items = form.items
      .map((it) => {
        const name = it.name.trim()
        const qty = Number.parseInt(it.qty, 10)
        const unitPriceGhs = Number.parseFloat(it.unitPriceGhs)
        const sku = it.sku.trim()
        if (!name) return null
        if (!Number.isFinite(qty) || qty <= 0) return null
        if (!Number.isFinite(unitPriceGhs) || unitPriceGhs < 0) return null
        return { name, qty, unitPriceGhs, sku: sku ? sku : undefined }
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
    setCreating(true)
    try {
      const res = await fetch('/api/sf/b2b-payments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          invoiceNumber,
          amountGhs,
          discountGhs: discountGhs > 0 ? discountGhs : undefined,
          paidGhs,
          items,
          dueAt,
          repName: form.repName.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Create failed')
      toast.success('Invoice saved')
      setCreateOpen(false)
      setForm(emptyForm())
      void load()
    } catch {
      toast.error('Could not save invoice')
    } finally {
      setCreating(false)
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    const outletName = editForm.outletName.trim()
    const invoiceNumber = editForm.invoiceNumber.trim()
    if (!outletName || !invoiceNumber) {
      toast.error('Outlet and invoice are required')
      return
    }
    const amountGhs = Number(editForm.amountGhs)
    const discountGhs = editForm.discountGhs.trim() === '' ? 0 : Number(editForm.discountGhs)
    const paidGhs = editForm.paidGhs.trim() === '' ? 0 : Number(editForm.paidGhs)
    if (
      !Number.isFinite(amountGhs) ||
      amountGhs < 0 ||
      !Number.isFinite(discountGhs) ||
      discountGhs < 0 ||
      !Number.isFinite(paidGhs) ||
      paidGhs < 0
    ) {
      toast.error('Enter valid numbers for amount and paid')
      return
    }
    const dueAt = editForm.dueDate.trim() ? dateToIsoNoon(editForm.dueDate) : null
    const items = editForm.items
      .map((it) => {
        const name = it.name.trim()
        const qty = Number.parseInt(it.qty, 10)
        const unitPriceGhs = Number.parseFloat(it.unitPriceGhs)
        const sku = it.sku.trim()
        if (!name) return null
        if (!Number.isFinite(qty) || qty <= 0) return null
        if (!Number.isFinite(unitPriceGhs) || unitPriceGhs < 0) return null
        return { name, qty, unitPriceGhs, sku: sku ? sku : undefined }
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
    setEditing(true)
    try {
      const res = await fetch(`/api/sf/b2b-payments/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outletName,
          invoiceNumber,
          amountGhs,
          discountGhs: discountGhs > 0 ? discountGhs : null,
          paidGhs,
          items,
          dueAt,
          repName: editForm.repName.trim() === '' ? null : editForm.repName.trim(),
          notes: editForm.notes.trim() === '' ? null : editForm.notes.trim(),
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
      'outlet',
      'invoice',
      'amount',
      'paid',
      'balance',
      'due',
      'rep',
      'status',
      'items',
    ]
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      header.join(','),
      ...collections.map((c) =>
        [
          esc(c.outletName),
          esc(c.invoiceNumber),
          c.amountGhs,
          c.paidGhs,
          c.balanceGhs,
          c.dueAt ?? '',
          c.repName ? esc(c.repName) : '',
          c.status,
          esc(
            (c.items ?? [])
              .map((it) => `${it.name} x${it.qty} @${it.unitPriceGhs}`)
              .join(' | '),
          ),
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `b2b-invoices-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="B2B Payments"
        description="Invoice ledger for B2B receivables. Track amount, paid, balance, due dates, and rep attribution."
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
                  Add invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-lg">
                <form onSubmit={submitCreate}>
                  <DialogHeader>
                    <DialogTitle>Add B2B invoice</DialogTitle>
                    <DialogDescription>
                      Create an invoice row with amount, paid, balance, due date, and rep.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="b2b-outlet">Outlet</Label>
                      <Input
                        id="b2b-outlet"
                        value={form.outletName}
                        onChange={(e) => setForm((f) => ({ ...f, outletName: e.target.value }))}
                        placeholder="Customer / store name"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b2b-invoice">Invoice</Label>
                      <Input
                        id="b2b-invoice"
                        value={form.invoiceNumber}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                        }
                        placeholder="INV-000123"
                        required
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="b2b-amt">Amount (GHS)</Label>
                        <Input
                          id="b2b-amt"
                          inputMode="decimal"
                          value={form.amountGhs}
                          onChange={(e) => setForm((f) => ({ ...f, amountGhs: e.target.value }))}
                          placeholder="0.00"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="b2b-discount">Discount (GHS)</Label>
                        <Input
                          id="b2b-discount"
                          inputMode="decimal"
                          value={form.discountGhs}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, discountGhs: e.target.value }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="b2b-paid">Paid (GHS)</Label>
                        <Input
                          id="b2b-paid"
                          inputMode="decimal"
                          value={form.paidGhs}
                          onChange={(e) => setForm((f) => ({ ...f, paidGhs: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="b2b-due">Due date</Label>
                        <Input
                          id="b2b-due"
                          type="date"
                          value={form.dueDate}
                          onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="b2b-rep">Rep</Label>
                        <Input
                          id="b2b-rep"
                          value={form.repName}
                          onChange={(e) => setForm((f) => ({ ...f, repName: e.target.value }))}
                          placeholder="Owner / collector"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="b2b-note">Notes</Label>
                      <Textarea
                        id="b2b-note"
                        value={form.notes}
                        onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Context, payment method, disputes…"
                        rows={3}
                        className="resize-y"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label>Order items (optional)</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              items: [...f.items, { name: '', sku: '', qty: '1', unitPriceGhs: '' }],
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
                                <Label htmlFor={`b2b-item-name-${idx}`}>Product</Label>
                                <Input
                                  id={`b2b-item-name-${idx}`}
                                  value={it.name}
                                  onChange={(e) =>
                                    setForm((f) => {
                                      const items = [...f.items]
                                      items[idx] = { ...items[idx], name: e.target.value }
                                      return { ...f, items }
                                    })
                                  }
                                  placeholder="Gelos Charcoal Toothpaste"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`b2b-item-sku-${idx}`}>SKU (optional)</Label>
                                <Input
                                  id={`b2b-item-sku-${idx}`}
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
                                <Label htmlFor={`b2b-item-qty-${idx}`}>Qty</Label>
                                <Input
                                  id={`b2b-item-qty-${idx}`}
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
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`b2b-item-unit-${idx}`}>Unit price (GHS)</Label>
                                <Input
                                  id={`b2b-item-unit-${idx}`}
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
                                />
                              </div>
                              <div className="flex items-end justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setForm((f) => ({
                                      ...f,
                                      items: f.items.filter((_, i) => i !== idx),
                                    }))
                                  }
                                  aria-label="Remove item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Items saved here will show via the eye icon in the table.
                      </p>
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
                        'Save invoice'
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
                  Total invoice amount
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Paid</p>
                <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
                  {formatGhs(kpis.paidGhs)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sum of paid across invoices
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
                  Paid ÷ invoiced
                </p>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground">
              Invoice ledger: {kpis.totalInvoices}{' '}
              {kpis.totalInvoices === 1 ? 'invoice' : 'invoices'} tracked (all time).
            </p>
          </div>
        ) : null}

        <div className="max-w-md space-y-2">
          <Label htmlFor="b2b-search" className="text-muted-foreground">
            Search
          </Label>
          <Input
            id="b2b-search"
            placeholder="Outlet, invoice, amount, rep, status…"
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
                <EmptyTitle>No invoices yet</EmptyTitle>
                <EmptyDescription>
                  Add invoices here to track receivables. Rows are stored in MongoDB{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    sf_b2b_invoices
                  </code>
                  .
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Discount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Due</TableHead>
                  <TableHead className="hidden lg:table-cell">Rep</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[88px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.outletName}</TableCell>
                    <TableCell className="font-mono text-xs font-medium">{c.invoiceNumber}</TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openItems(c)}
                        aria-label="View items"
                        title={c.items?.length ? 'View items' : 'No items saved yet'}
                      >
                        <Eye className={c.items?.length ? 'h-4 w-4' : 'h-4 w-4 opacity-40'} />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatGhs(c.amountGhs)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">
                      {c.discountGhs ? `−${formatGhs(c.discountGhs)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatGhs(c.paidGhs)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatGhs(c.balanceGhs)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground tabular-nums">
                      {c.dueAt ? format(new Date(c.dueAt), 'd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {c.repName ?? '—'}
                    </TableCell>
                    <TableCell>
                      {c.status === 'paid' ? (
                        <span className="text-emerald-600">Paid</span>
                      ) : c.status === 'overdue' ? (
                        <span className="text-destructive">Overdue</span>
                      ) : (
                        <span className="text-muted-foreground">Open</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(c)}
                          aria-label="Edit invoice"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => void remove(c.id)}
                          aria-label="Delete invoice"
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
              <DialogTitle>Edit invoice</DialogTitle>
              <DialogDescription>Update amount, paid, due date, or attribution.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-b2b-outlet">Outlet</Label>
                <Input
                  id="edit-b2b-outlet"
                  value={editForm.outletName}
                  onChange={(e) => setEditForm((f) => ({ ...f, outletName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-b2b-invoice">Invoice</Label>
                <Input
                  id="edit-b2b-invoice"
                  value={editForm.invoiceNumber}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, invoiceNumber: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-amt">Amount (GHS)</Label>
                  <Input
                    id="edit-b2b-amt"
                    inputMode="decimal"
                    value={editForm.amountGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, amountGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-discount">Discount (GHS)</Label>
                  <Input
                    id="edit-b2b-discount"
                    inputMode="decimal"
                    value={editForm.discountGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, discountGhs: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-paid">Paid (GHS)</Label>
                  <Input
                    id="edit-b2b-paid"
                    inputMode="decimal"
                    value={editForm.paidGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, paidGhs: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-due">Due date</Label>
                  <Input
                    id="edit-b2b-due"
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, dueDate: e.target.value }))}
                    placeholder="Clear to remove"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-b2b-rep">Rep</Label>
                  <Input
                    id="edit-b2b-rep"
                    value={editForm.repName}
                    onChange={(e) => setEditForm((f) => ({ ...f, repName: e.target.value }))}
                    placeholder="Clear to remove"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-b2b-note">Notes</Label>
                <Textarea
                  id="edit-b2b-note"
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="resize-y"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Order items (optional)</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setEditForm((f) => ({
                        ...f,
                        items: [...f.items, { name: '', sku: '', qty: '1', unitPriceGhs: '' }],
                      }))
                    }
                  >
                    Add item
                  </Button>
                </div>
                <div className="space-y-3">
                  {editForm.items.map((it, idx) => (
                    <div key={idx} className="rounded-lg border border-border p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor={`edit-b2b-item-name-${idx}`}>Product</Label>
                          <Input
                            id={`edit-b2b-item-name-${idx}`}
                            value={it.name}
                            onChange={(e) =>
                              setEditForm((f) => {
                                const items = [...f.items]
                                items[idx] = { ...items[idx], name: e.target.value }
                                return { ...f, items }
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-b2b-item-sku-${idx}`}>SKU (optional)</Label>
                          <Input
                            id={`edit-b2b-item-sku-${idx}`}
                            value={it.sku}
                            onChange={(e) =>
                              setEditForm((f) => {
                                const items = [...f.items]
                                items[idx] = { ...items[idx], sku: e.target.value }
                                return { ...f, items }
                              })
                            }
                          />
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor={`edit-b2b-item-qty-${idx}`}>Qty</Label>
                          <Input
                            id={`edit-b2b-item-qty-${idx}`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={it.qty}
                            onChange={(e) =>
                              setEditForm((f) => {
                                const items = [...f.items]
                                items[idx] = { ...items[idx], qty: e.target.value }
                                return { ...f, items }
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`edit-b2b-item-unit-${idx}`}>Unit price (GHS)</Label>
                          <Input
                            id={`edit-b2b-item-unit-${idx}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={it.unitPriceGhs}
                            onChange={(e) =>
                              setEditForm((f) => {
                                const items = [...f.items]
                                items[idx] = { ...items[idx], unitPriceGhs: e.target.value }
                                return { ...f, items }
                              })
                            }
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() =>
                              setEditForm((f) => ({
                                ...f,
                                items: f.items.filter((_, i) => i !== idx),
                              }))
                            }
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Items saved here will show via the eye icon in the table.
                </p>
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

      <Dialog open={itemsOpen} onOpenChange={setItemsOpen}>
        <DialogContent className="max-h-[min(90vh,40rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order items</DialogTitle>
            <DialogDescription>{itemsTitle}</DialogDescription>
          </DialogHeader>

          {itemsForModal.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No items for this invoice.</div>
          ) : (
            <div className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden sm:table-cell">SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsForModal.map((it, idx) => (
                    <TableRow key={`${it.name}-${it.sku ?? ''}-${idx}`}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                        {it.sku ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatGhs(it.unitPriceGhs)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatGhs(it.qty * it.unitPriceGhs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-end gap-4">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="text-base font-semibold tabular-nums">
                  {formatGhs(
                    itemsForModal.reduce((s, it) => s + it.qty * it.unitPriceGhs, 0),
                  )}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setItemsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
