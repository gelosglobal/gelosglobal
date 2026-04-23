'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, Loader2, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { cn } from '@/lib/utils'
import { formatGhs } from '@/lib/dtc-orders'

export type CustomerSegment = 'High LTV' | 'At risk' | 'New (30d)' | 'Core'

/** Matches GET `/api/dtc/customers` — same field names as the on-page table headers. */
export type CustomerRow = {
  id: string
  customerName: string
  phoneNumber: string
  totalOrders: number
  totalBilled: number
  totalCollected: number
  location: string
  returned: number
  firstOrderDate: string
  lastOrderDate: string
  totalBilledFormatted: string
  totalCollectedFormatted: string
  returnedFormatted: string
  segment: CustomerSegment
  computedSegment: CustomerSegment
}

type SegmentCounts = {
  highLtv: number
  atRisk: number
  new30d: number
  core: number
}

type CustomerSortKey = 'billed' | 'name' | 'orders' | 'lastOrder'

function fmtTableDate(s: string): string {
  if (!s?.trim()) return '—'
  try {
    const d = s.includes('T') ? parseISO(s) : parseISO(`${s}T12:00:00`)
    return Number.isNaN(d.getTime()) ? s : format(d, 'dd MMM yyyy')
  } catch {
    return s
  }
}

export function CustomerIntelligenceView() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [segments, setSegments] = useState<SegmentCounts | null>(null)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sortBy, setSortBy] = useState<CustomerSortKey>('billed')
  const [createForm, setCreateForm] = useState({
    customer: '',
    phone: '',
    location: '',
    segment: 'Core' as CustomerSegment,
    totalOrders: '',
    totalBilled: '',
    totalCollected: '',
    returnedType: 'count' as 'count' | 'ghs',
    returnedValue: '',
    firstOrderDate: '',
    lastOrderDate: '',
  })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/dtc/customers', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load customer intelligence')
      const data = (await res.json()) as {
        customers: CustomerRow[]
        segments: SegmentCounts
      }
      setCustomers(data.customers)
      setSegments(data.segments)
    } catch {
      toast.error('Could not load customers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const displayRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = !q
      ? [...customers]
      : customers.filter((c) => c.customerName.toLowerCase().includes(q))

    base.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.customerName.localeCompare(b.customerName)
        case 'orders':
          return (
            b.totalOrders - a.totalOrders ||
            b.totalBilled - a.totalBilled ||
            a.customerName.localeCompare(b.customerName)
          )
        case 'lastOrder': {
          const ta = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0
          const tb = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0
          return tb - ta || b.totalBilled - a.totalBilled
        }
        case 'billed':
        default:
          return (
            b.totalBilled - a.totalBilled ||
            b.totalOrders - a.totalOrders ||
            a.customerName.localeCompare(b.customerName)
          )
      }
    })

    return base
  }, [customers, query, sortBy])

  const totals = useMemo(() => {
    const totalCustomers = customers.length
    const totalBilled = customers.reduce((sum, c) => sum + c.totalBilled, 0)
    const avgTotalBilled = totalCustomers === 0 ? 0 : totalBilled / totalCustomers
    return { totalCustomers, totalBilled, avgTotalBilled }
  }, [customers])

  function handleExport() {
    if (customers.length === 0) {
      toast.message('No customers to export yet')
      return
    }
    const header = [
      '#',
      'Customer name',
      'Phone number',
      'Total orders',
      'Total billed',
      'Total collected',
      'Location',
      'Returned',
      'First order date',
      'Last order date',
    ]
    const lines = [
      header.join(','),
      ...customers.map((c, i) =>
        [
          i + 1,
          `"${c.customerName.replace(/"/g, '""')}"`,
          `"${(c.phoneNumber ?? '').replace(/"/g, '""')}"`,
          c.totalOrders,
          c.totalBilled,
          c.totalCollected,
          `"${(c.location ?? '').replace(/"/g, '""')}"`,
          c.returned,
          c.firstOrderDate,
          c.lastOrderDate,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-customers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  function handleExportExcel() {
    if (customers.length === 0) {
      toast.message('No customers to export yet')
      return
    }

    const wb = XLSX.utils.book_new()

    const customersSheet = XLSX.utils.json_to_sheet(
      customers.map((c, i) => ({
        '#': i + 1,
        'Customer name': c.customerName,
        'Phone number': c.phoneNumber,
        'Total orders': c.totalOrders,
        'Total billed': c.totalBilled,
        'Total collected': c.totalCollected,
        Location: c.location,
        Returned: c.returned,
        'First order date': c.firstOrderDate,
        'Last order date': c.lastOrderDate,
      })),
    )
    XLSX.utils.book_append_sheet(wb, customersSheet, 'Customers')

    const segmentsSheet = XLSX.utils.json_to_sheet([
      {
        customersTracked: totals.totalCustomers,
        totalBilled: totals.totalBilled,
        avgTotalBilled: totals.avgTotalBilled,
        highLtv: segments?.highLtv ?? 0,
        atRisk: segments?.atRisk ?? 0,
        new30d: segments?.new30d ?? 0,
        core: segments?.core ?? 0,
      },
    ])
    XLSX.utils.book_append_sheet(wb, segmentsSheet, 'Segments')

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-customer-intelligence-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel download started')
  }

  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    const name = createForm.customer.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/dtc/customers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: name,
          phone: createForm.phone.trim() || undefined,
          location: createForm.location.trim() || undefined,
          segment: createForm.segment,
          totalOrders: createForm.totalOrders.trim() === '' ? undefined : Number(createForm.totalOrders),
          totalBilledGhs: createForm.totalBilled.trim() === '' ? undefined : Number(createForm.totalBilled),
          totalCollectedGhs:
            createForm.totalCollected.trim() === '' ? undefined : Number(createForm.totalCollected),
          returnedType: createForm.returnedType,
          returned:
            createForm.returnedValue.trim() === '' ? undefined : Number(createForm.returnedValue),
          firstOrderDate: createForm.firstOrderDate.trim() || undefined,
          lastOrderDate: createForm.lastOrderDate.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Could not create customer')
      }
      toast.success('Customer added')
      setCreateOpen(false)
      setCreateForm({
        customer: '',
        phone: '',
        location: '',
        segment: 'Core',
        totalOrders: '',
        totalBilled: '',
        totalCollected: '',
        returnedType: 'count',
        returnedValue: '',
        firstOrderDate: '',
        lastOrderDate: '',
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add customer')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Customer Intelligence"
        description="Customer list with totals from your sheet and from sell-out orders. Columns include name, phone, orders, billed, collected, location, returns, and first/last order dates."
        actions={
          <>
            <Button
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add customer
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleExport}
              disabled={loading || customers.length === 0}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleExportExcel}
              disabled={loading || customers.length === 0}
            >
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
          </>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Customers tracked
            </p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? '—' : totals.totalCustomers.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Unique customer names</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Avg total billed
            </p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? '—' : formatGhs(totals.avgTotalBilled)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Per customer (sheet or orders)</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-indigo-600">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              High billed
            </p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? '—' : segments?.highLtv ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Billed ≥ GHS 2,000 or 10+ orders</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-red-600">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              At risk
            </p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? '—' : segments?.atRisk ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">No order in 60+ days</p>
          </Card>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md flex-1 space-y-2">
            <Label htmlFor="customer-search" className="text-muted-foreground">
              Search customers
            </Label>
            <Input
              id="customer-search"
              placeholder="Customer name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-3 sm:justify-end">
            <div className="w-full min-w-[10rem] space-y-2 sm:w-44">
              <Label htmlFor="customer-sort" className="text-muted-foreground">
                Sort by
              </Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as CustomerSortKey)}>
                <SelectTrigger id="customer-sort" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billed">Total billed (high first)</SelectItem>
                  <SelectItem value="orders">Total orders (most first)</SelectItem>
                  <SelectItem value="lastOrder">Last order date (recent first)</SelectItem>
                  <SelectItem value="name">Customer name (A–Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {query ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')}>
                Clear search
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Customer list
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={load}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading customers…
            </div>
          ) : displayRows.length === 0 ? (
            <div className="p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {customers.length === 0 ? 'No customers yet' : 'No matches'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {customers.length === 0
                      ? 'Use Add customer to create a record, or wait until customer data is available. Sell-out orders stay in Orders.'
                      : 'Try a different search term.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 min-w-10 text-right tabular-nums text-muted-foreground">#</TableHead>
                  <TableHead className="min-w-[10rem] whitespace-nowrap">Customer name</TableHead>
                  <TableHead className="min-w-[7rem] whitespace-nowrap">Phone number</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total orders</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total billed</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total collected</TableHead>
                  <TableHead className="min-w-[8rem] whitespace-nowrap">Location</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Returned</TableHead>
                  <TableHead className="whitespace-nowrap">First order date</TableHead>
                  <TableHead className="whitespace-nowrap">Last order date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((c, i) => {
                  const isAtRisk = c.segment === 'At risk'
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-right text-muted-foreground tabular-nums text-sm">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{c.customerName}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {c.phoneNumber || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.totalOrders.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {c.totalBilledFormatted}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.totalCollectedFormatted}</TableCell>
                      <TableCell className="max-w-[14rem] truncate text-muted-foreground" title={c.location}>
                        {c.location || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.returnedFormatted}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {fmtTableDate(c.firstOrderDate)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'whitespace-nowrap text-muted-foreground',
                          isAtRisk && 'text-red-600',
                        )}
                      >
                        {fmtTableDate(c.lastOrderDate)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form onSubmit={handleCreateCustomer}>
            <DialogHeader>
              <DialogTitle>Add customer</DialogTitle>
              <DialogDescription>
                Add a customer row to the intelligence list (same columns as the table).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="new-customer">Customer name</Label>
                  <Input
                    id="new-customer"
                    value={createForm.customer}
                    onChange={(e) => setCreateForm((f) => ({ ...f, customer: e.target.value }))}
                    placeholder="Elite Pharmacy"
                    autoComplete="organization"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer-phone">Phone</Label>
                  <Input
                    id="customer-phone"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+233 20 000 0000"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="customer-location">Location</Label>
                  <Input
                    id="customer-location"
                    value={createForm.location}
                    onChange={(e) => setCreateForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Accra, Ghana"
                    autoComplete="address-level2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-total-orders">Total orders</Label>
                  <Input
                    id="ci-total-orders"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={createForm.totalOrders}
                    onChange={(e) => setCreateForm((f) => ({ ...f, totalOrders: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-total-billed">Total billed (GHS)</Label>
                  <Input
                    id="ci-total-billed"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={createForm.totalBilled}
                    onChange={(e) => setCreateForm((f) => ({ ...f, totalBilled: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-total-collected">Total collected (GHS)</Label>
                  <Input
                    id="ci-total-collected"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={createForm.totalCollected}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, totalCollected: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Returned</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={createForm.returnedType}
                      onValueChange={(v) =>
                        setCreateForm((f) => ({ ...f, returnedType: v as 'count' | 'ghs' }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="count">Count</SelectItem>
                        <SelectItem value="ghs">GHS</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="ci-returned"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={createForm.returnedType === 'count' ? 1 : '0.01'}
                      value={createForm.returnedValue}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, returnedValue: e.target.value }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-first-order">First order date</Label>
                  <Input
                    id="ci-first-order"
                    type="date"
                    value={createForm.firstOrderDate}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, firstOrderDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-last-order">Last order date</Label>
                  <Input
                    id="ci-last-order"
                    type="date"
                    value={createForm.lastOrderDate}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, lastOrderDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Segment</Label>
                  <Select
                    value={createForm.segment}
                    onValueChange={(v) =>
                      setCreateForm((f) => ({ ...f, segment: v as CustomerSegment }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Core">Core</SelectItem>
                      <SelectItem value="New (30d)">New (30d)</SelectItem>
                      <SelectItem value="High LTV">High LTV</SelectItem>
                      <SelectItem value="At risk">At risk</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This is a manual label. The table also computes a live segment from order history.
                  </p>
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
                    Saving…
                  </>
                ) : (
                  'Add customer'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

