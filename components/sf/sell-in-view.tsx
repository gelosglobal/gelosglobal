'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Calendar,
  CircleDollarSign,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Search,
  Ship,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { SellInPageHeader } from '@/components/sell-in/sell-in-page-header'
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
import { formatGhs } from '@/lib/dtc-orders'
import { cn } from '@/lib/utils'

type SellInStatus = 'ordered' | 'in_transit' | 'arrived'

type SellInRow = {
  id: string
  sellInGhs: number
  costPriceGhs: number
  productName: string
  country: string
  manufacturerName: string
  manufacturerContact: string
  occurredAt: string
  quantity: number
  status: SellInStatus
  etaAt: string | null
}

type SellInForm = ReturnType<typeof emptyForm>

const STATUS_OPTIONS: { value: SellInStatus; label: string }[] = [
  { value: 'ordered', label: 'Ordered' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'arrived', label: 'Arrived' },
]

function emptyForm() {
  return {
    sellInGhs: '',
    costPriceGhs: '',
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

function statusLabel(status: SellInStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status
}

function statusBadge(status: SellInStatus) {
  if (status === 'arrived') {
    return (
      <Badge className="bg-emerald-600/15 text-emerald-800 hover:bg-emerald-600/15 dark:bg-emerald-500/20 dark:text-emerald-300">
        Arrived
      </Badge>
    )
  }
  if (status === 'in_transit') {
    return (
      <Badge className="bg-sky-600/15 text-sky-800 hover:bg-sky-600/15 dark:bg-sky-500/20 dark:text-sky-300">
        In transit
      </Badge>
    )
  }
  return <Badge variant="outline">Ordered</Badge>
}

function lineTotals(form: SellInForm) {
  const unit = Number(form.sellInGhs)
  const cost = form.costPriceGhs.trim() === '' ? 0 : Number(form.costPriceGhs)
  const qty = Number(form.quantity)
  const valid =
    Number.isFinite(unit) &&
    Number.isFinite(cost) &&
    Number.isFinite(qty) &&
    unit >= 0 &&
    cost >= 0 &&
    qty >= 0
  if (!valid) {
    return { lineValue: null as number | null, expectedIncome: null as number | null }
  }
  return {
    lineValue: unit * qty,
    expectedIncome: cost * qty,
  }
}

function SellInKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconWrapClass,
  iconClass,
}: {
  label: string
  value: ReactNode
  subtitle: ReactNode
  icon: LucideIcon
  iconWrapClass: string
  iconClass: string
}) {
  return (
    <Card className="dashboard-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={cn('shrink-0 rounded-2xl p-3', iconWrapClass)}>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </div>
      </div>
    </Card>
  )
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

function LinePreview({ form }: { form: SellInForm }) {
  const { lineValue, expectedIncome } = lineTotals(form)
  return (
    <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-3 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Line value
        </p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
          {lineValue == null ? '—' : formatGhs(lineValue)}
        </p>
        <p className="text-xs text-muted-foreground">Unit sell-in × qty</p>
      </div>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Expected income
        </p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
          {expectedIncome == null ? '—' : formatGhs(expectedIncome)}
        </p>
        <p className="text-xs text-muted-foreground">Cost price × qty</p>
      </div>
    </div>
  )
}

function SellInFormFields({
  idPrefix,
  form,
  onChange,
}: {
  idPrefix: string
  form: SellInForm
  onChange: (patch: Partial<SellInForm>) => void
}) {
  return (
    <div className="grid gap-5 py-2">
      <FormSection title="Product">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-product`}>Product name</Label>
          <Input
            id={`${idPrefix}-product`}
            value={form.productName}
            onChange={(e) => onChange({ productName: e.target.value })}
            placeholder="Gelos Charcoal Toothpaste"
            required
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-country`}>Country</Label>
            <Input
              id={`${idPrefix}-country`}
              value={form.country}
              onChange={(e) => onChange({ country: e.target.value })}
              placeholder="Ghana"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-date`}>Order date</Label>
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={form.occurredAt}
              onChange={(e) => onChange({ occurredAt: e.target.value })}
              required
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Manufacturer">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-mfg`}>Name</Label>
            <Input
              id={`${idPrefix}-mfg`}
              value={form.manufacturerName}
              onChange={(e) => onChange({ manufacturerName: e.target.value })}
              placeholder="Gelos Manufacturing Ltd"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-mfg-contact`}>Contact</Label>
            <Input
              id={`${idPrefix}-mfg-contact`}
              value={form.manufacturerContact}
              onChange={(e) => onChange({ manufacturerContact: e.target.value })}
              placeholder="Phone / email"
              required
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Pricing & quantity">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-sellin`}>Unit sell-in (GHS)</Label>
            <Input
              id={`${idPrefix}-sellin`}
              inputMode="decimal"
              value={form.sellInGhs}
              onChange={(e) => onChange({ sellInGhs: e.target.value })}
              placeholder="0"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-cost`}>Cost price (GHS)</Label>
            <Input
              id={`${idPrefix}-cost`}
              inputMode="decimal"
              value={form.costPriceGhs}
              onChange={(e) => onChange({ costPriceGhs: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-qty`}>Quantity</Label>
            <Input
              id={`${idPrefix}-qty`}
              inputMode="numeric"
              value={form.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              placeholder="0"
              required
            />
          </div>
        </div>
        <LinePreview form={form} />
      </FormSection>

      <FormSection title="Shipment">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => onChange({ status: v as SellInStatus })}
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
            <Label htmlFor={`${idPrefix}-eta`}>ETA {form.status === 'arrived' ? '(optional)' : ''}</Label>
            <Input
              id={`${idPrefix}-eta`}
              type="date"
              value={form.etaAt}
              onChange={(e) => onChange({ etaAt: e.target.value })}
            />
          </div>
        </div>
      </FormSection>
    </div>
  )
}

function validateForm(form: SellInForm): string | null {
  const sellInGhs = Number(form.sellInGhs)
  const costPriceGhs = form.costPriceGhs.trim() === '' ? 0 : Number(form.costPriceGhs)
  const quantity = Number(form.quantity)
  if (!form.productName.trim()) return 'Enter a product name'
  if (!form.country.trim()) return 'Enter a country'
  if (!form.manufacturerName.trim()) return 'Enter a manufacturer name'
  if (!form.manufacturerContact.trim()) return 'Enter a manufacturer contact'
  if (!Number.isFinite(sellInGhs) || sellInGhs < 0) return 'Enter a valid sell-in value'
  if (!Number.isFinite(costPriceGhs) || costPriceGhs < 0) return 'Enter a valid cost price'
  if (!Number.isFinite(quantity) || quantity < 0) return 'Enter a valid quantity'
  if (!dateToIsoNoon(form.occurredAt)) return 'Select a date'
  return null
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

  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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

  const statusCounts = useMemo(() => {
    const counts = { all: rows.length, ordered: 0, in_transit: 0, arrived: 0 }
    for (const r of rows) counts[r.status] += 1
    return counts
  }, [rows])

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
        statusLabel(r.status).toLowerCase().includes(q)
      )
    })
  }, [rows, query, statusFilter])

  const totals = useMemo(() => {
    let totalQty = 0
    let totalValue = 0
    let totalExpectedIncome = 0
    for (const r of filtered) {
      totalQty += r.quantity
      totalValue += r.sellInGhs * r.quantity
      totalExpectedIncome += (Number(r.costPriceGhs ?? 0) || 0) * r.quantity
    }
    return { totalQty, totalValue, totalExpectedIncome, lines: filtered.length }
  }, [filtered])

  const deleteTarget = deleteId ? rows.find((r) => r.id === deleteId) : null
  const filtersActive = statusFilter !== 'all' || query.trim() !== ''

  function openEdit(row: SellInRow) {
    setEditId(row.id)
    setEditForm({
      sellInGhs: String(row.sellInGhs),
      costPriceGhs: String(row.costPriceGhs ?? 0),
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
    const error = validateForm(form)
    if (error) {
      toast.error(error)
      return
    }
    const sellInGhs = Number(form.sellInGhs)
    const costPriceGhs = form.costPriceGhs.trim() === '' ? 0 : Number(form.costPriceGhs)
    const quantity = Number(form.quantity)
    const occurredAt = dateToIsoNoon(form.occurredAt)!
    const etaAt = form.etaAt.trim() ? dateToIsoNoon(form.etaAt) : undefined

    setCreating(true)
    try {
      const res = await fetch('/api/sf/sell-in', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellInGhs,
          costPriceGhs,
          productName: form.productName.trim(),
          country: form.country.trim(),
          manufacturerName: form.manufacturerName.trim(),
          manufacturerContact: form.manufacturerContact.trim(),
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
    const error = validateForm(editForm)
    if (error) {
      toast.error(error)
      return
    }
    const sellInGhs = Number(editForm.sellInGhs)
    const costPriceGhs = editForm.costPriceGhs.trim() === '' ? 0 : Number(editForm.costPriceGhs)
    const quantity = Number(editForm.quantity)
    const occurredAt = dateToIsoNoon(editForm.occurredAt)!
    const etaAt = editForm.etaAt.trim() ? dateToIsoNoon(editForm.etaAt) : null

    setEditing(true)
    try {
      const res = await fetch(`/api/sf/sell-in/${editId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellInGhs,
          costPriceGhs,
          productName: editForm.productName.trim(),
          country: editForm.country.trim(),
          manufacturerName: editForm.manufacturerName.trim(),
          manufacturerContact: editForm.manufacturerContact.trim(),
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

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sf/sell-in/${deleteId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Delete failed')
      toast.success('Removed')
      setDeleteId(null)
      await load()
    } catch {
      toast.error('Could not delete sell-in row')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SellInPageHeader
        title="Sell-in"
        description="Track product lines from order through arrival, with value and expected income at a glance."
        actions={
          <Dialog
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open)
              if (!open) setForm(emptyForm())
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add sell-in
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[min(92vh,44rem)] overflow-y-auto sm:max-w-xl">
              <form onSubmit={submitCreate}>
                <DialogHeader>
                  <DialogTitle>Add sell-in line</DialogTitle>
                  <DialogDescription>
                    Record product, pricing, and shipment status in one place.
                  </DialogDescription>
                </DialogHeader>
                <SellInFormFields
                  idPrefix="si"
                  form={form}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
                <DialogFooter className="gap-2 sm:gap-0">
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
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SellInKpiCard
            label="Lines"
            value={loading ? '—' : totals.lines}
            subtitle={filtersActive ? 'Matching filters' : 'All sell-in lines'}
            icon={Package}
            iconWrapClass="bg-muted"
            iconClass="text-foreground"
          />
          <SellInKpiCard
            label="Total quantity"
            value={loading ? '—' : totals.totalQty.toLocaleString()}
            subtitle="Units across filtered lines"
            icon={Boxes}
            iconWrapClass="bg-sky-500/15"
            iconClass="text-sky-700 dark:text-sky-300"
          />
          <SellInKpiCard
            label="Expected income"
            value={loading ? '—' : formatGhs(totals.totalExpectedIncome)}
            subtitle="Cost price × quantity"
            icon={Wallet}
            iconWrapClass="bg-amber-500/15"
            iconClass="text-amber-700 dark:text-amber-300"
          />
          <SellInKpiCard
            label="Total value"
            value={loading ? '—' : formatGhs(totals.totalValue)}
            subtitle="Unit sell-in × quantity"
            icon={CircleDollarSign}
            iconWrapClass="bg-emerald-500/15"
            iconClass="text-emerald-700 dark:text-emerald-300"
          />
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: 'all' as const, label: 'All', count: statusCounts.all },
                { value: 'ordered' as const, label: 'Ordered', count: statusCounts.ordered },
                { value: 'in_transit' as const, label: 'In transit', count: statusCounts.in_transit },
                { value: 'arrived' as const, label: 'Arrived', count: statusCounts.arrived },
              ] as const
            ).map((chip) => {
              const active = statusFilter === chip.value
              return (
                <Button
                  key={chip.value}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="h-8 gap-1.5 rounded-full px-3"
                  onClick={() => setStatusFilter(chip.value)}
                >
                  {chip.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                      active ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {chip.count}
                  </span>
                </Button>
              )
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="si-search"
                className="pl-9 pr-9"
                placeholder="Search product, country, manufacturer…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search sell-in lines"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {filtersActive ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start sm:self-auto"
                onClick={() => {
                  setQuery('')
                  setStatusFilter('all')
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Sell-in lines</h2>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? 'Loading…'
                  : `${filtered.length} of ${rows.length} line${rows.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <Ship className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No sell-in lines yet</EmptyTitle>
                <EmptyDescription>
                  Add your first product line to start tracking orders, transit, and arrivals.
                </EmptyDescription>
              </EmptyHeader>
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add sell-in
              </Button>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty className="border-0 py-14">
              <EmptyHeader>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>
                  Try another search or status filter, or reset to see all lines.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery('')
                  setStatusFilter('all')
                }}
              >
                Reset filters
              </Button>
            </Empty>
          ) : (
            <>
              <div className="divide-y divide-border md:hidden">
                {filtered.map((r) => {
                  const total = r.sellInGhs * r.quantity
                  const expectedIncome = (Number(r.costPriceGhs ?? 0) || 0) * r.quantity
                  return (
                    <div key={r.id} className="space-y-3 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{r.productName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{r.country}</span>
                            <span aria-hidden>·</span>
                            <span className="truncate">{r.manufacturerName}</span>
                          </p>
                        </div>
                        {statusBadge(r.status)}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Qty
                          </p>
                          <p className="font-medium tabular-nums">{r.quantity.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Line value
                          </p>
                          <p className="font-medium tabular-nums">{formatGhs(total)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Expected income
                          </p>
                          <p className="font-medium tabular-nums">{formatGhs(expectedIncome)}</p>
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Date
                          </p>
                          <p className="font-medium">
                            {format(new Date(r.occurredAt), 'd MMM yyyy')}
                          </p>
                        </div>
                      </div>

                      {r.status !== 'arrived' && r.etaAt ? (
                        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          ETA {format(new Date(r.etaAt), 'd MMM yyyy')}
                        </p>
                      ) : null}

                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(r)}
                          aria-label={`Edit ${r.productName}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(r.id)}
                          aria-label={`Delete ${r.productName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Origin</TableHead>
                      <TableHead className="hidden xl:table-cell">Date</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">Unit</TableHead>
                      <TableHead className="text-right">Line value</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">
                        Expected income
                      </TableHead>
                      <TableHead className="w-[88px] text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const total = r.sellInGhs * r.quantity
                      const expectedIncome = (Number(r.costPriceGhs ?? 0) || 0) * r.quantity
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{r.productName}</p>
                              <p className="truncate text-xs text-muted-foreground lg:hidden">
                                {r.country} · {r.manufacturerName}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-start gap-1">
                              {statusBadge(r.status)}
                              {r.status !== 'arrived' && r.etaAt ? (
                                <span className="text-[11px] text-muted-foreground">
                                  ETA {format(new Date(r.etaAt), 'd MMM')}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground">{r.country}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {r.manufacturerName}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground xl:table-cell">
                            {format(new Date(r.occurredAt), 'd MMM yyyy')}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                            {formatGhs(r.sellInGhs)}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatGhs(total)}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                            {formatGhs(expectedIncome)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEdit(r)}
                                aria-label={`Edit ${r.productName}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteId(r.id)}
                                aria-label={`Delete ${r.productName}`}
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
              </div>
            </>
          )}
        </Card>
      </div>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setEditId(null)
        }}
      >
        <DialogContent className="max-h-[min(92vh,44rem)] overflow-y-auto sm:max-w-xl">
          <form onSubmit={submitEdit}>
            <DialogHeader>
              <DialogTitle>Edit sell-in</DialogTitle>
              <DialogDescription>Update pricing, shipment status, or ETA.</DialogDescription>
            </DialogHeader>
            <SellInFormFields
              idPrefix="edit-si"
              form={editForm}
              onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
            />
            <DialogFooter className="gap-2 sm:gap-0">
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

      <AlertDialog open={!!deleteId} onOpenChange={(open) => (!open ? setDeleteId(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sell-in line?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This will permanently remove “${deleteTarget.productName}”.`
                : 'This will permanently remove this sell-in line.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
