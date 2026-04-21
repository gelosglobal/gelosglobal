'use client'

import { useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Download, Loader2, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
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
import { cn } from '@/lib/utils'
import { formatGhs } from '@/lib/dtc-orders'

type CustomerRow = {
  customer: string
  phone: string
  email: string
  location: string
  source: 'walk_in' | 'instagram' | 'web' | 'referral' | 'sales_rep' | 'other'
  joinDate: string
  orders: number
  ltv: number
  ltvFormatted: string
  firstOrderAt: string
  lastOrderAt: string
  segment: 'High LTV' | 'At risk' | 'New (30d)' | 'Core'
  computedSegment: 'High LTV' | 'At risk' | 'New (30d)' | 'Core'
}

type SegmentCounts = {
  highLtv: number
  atRisk: number
  new30d: number
  core: number
}

function segmentBadge(segment: CustomerRow['segment']) {
  switch (segment) {
    case 'High LTV':
      return <Badge className="bg-indigo-600 hover:bg-indigo-600">High LTV</Badge>
    case 'At risk':
      return <Badge variant="destructive">At risk</Badge>
    case 'New (30d)':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">New</Badge>
    default:
      return <Badge variant="outline">Core</Badge>
  }
}

export function CustomerIntelligenceView() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [segments, setSegments] = useState<SegmentCounts | null>(null)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [createForm, setCreateForm] = useState({
    customer: '',
    phone: '',
    email: '',
    location: '',
    source: 'instagram' as CustomerRow['source'],
    joinDate: new Date().toISOString().slice(0, 10),
    segment: 'Core' as CustomerRow['segment'],
  })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/dtc/customers', { credentials: 'include' })
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.customer.toLowerCase().includes(q))
  }, [customers, query])

  const totals = useMemo(() => {
    const totalCustomers = customers.length
    const totalLtv = customers.reduce((sum, c) => sum + c.ltv, 0)
    const avgLtv = totalCustomers === 0 ? 0 : totalLtv / totalCustomers
    return { totalCustomers, totalLtv, avgLtv }
  }, [customers])

  function handleExport() {
    if (customers.length === 0) {
      toast.message('No customers to export yet')
      return
    }
    const header = [
      'customer',
      'phone',
      'email',
      'location',
      'source',
      'joinDate',
      'segment',
      'computedSegment',
      'orders',
      'ltv',
      'firstOrderAt',
      'lastOrderAt',
    ]
    const lines = [
      header.join(','),
      ...customers.map((c) =>
        [
          `"${c.customer.replace(/"/g, '""')}"`,
          `"${(c.phone ?? '').replace(/"/g, '""')}"`,
          `"${(c.email ?? '').replace(/"/g, '""')}"`,
          `"${(c.location ?? '').replace(/"/g, '""')}"`,
          c.source,
          c.joinDate,
          c.segment,
          c.computedSegment,
          c.orders,
          c.ltv,
          c.firstOrderAt,
          c.lastOrderAt,
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
      customers.map((c) => ({
        customer: c.customer,
        phone: c.phone,
        email: c.email,
        location: c.location,
        source: c.source,
        joinDate: c.joinDate,
        segment: c.segment,
        computedSegment: c.computedSegment,
        orders: c.orders,
        ltv: c.ltv,
        firstOrderAt: c.firstOrderAt,
        lastOrderAt: c.lastOrderAt,
      })),
    )
    XLSX.utils.book_append_sheet(wb, customersSheet, 'Customers')

    const segmentsSheet = XLSX.utils.json_to_sheet([
      {
        customersTracked: totals.totalCustomers,
        totalLtv: totals.totalLtv,
        avgLtv: totals.avgLtv,
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

  async function handleImportExcel(file: File) {
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })

      const sheet =
        wb.Sheets['Customers'] ??
        wb.Sheets[wb.SheetNames[0] ?? '']
      if (!sheet) {
        toast.error('No sheets found in this file')
        return
      }

      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      if (!Array.isArray(json) || json.length === 0) {
        toast.error('No rows found in the sheet')
        return
      }

      const normalizeHeader = (h: unknown) =>
        String(h ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .replace(/[()]/g, '')

      const get = (row: Record<string, unknown>, ...candidates: string[]) => {
        for (const k of Object.keys(row)) {
          const nk = normalizeHeader(k)
          if (candidates.includes(nk)) return row[k]
        }
        return undefined
      }

      const parseMoney = (v: unknown): number | undefined => {
        if (typeof v === 'number' && Number.isFinite(v)) return v
        const s = String(v ?? '').trim()
        if (!s) return undefined
        const n = Number(s.replace(/[^0-9.\-]/g, ''))
        return Number.isFinite(n) ? n : undefined
      }

      const rows = json
        .map((r) => {
          const customer = String(
            get(r, 'customer', 'name') ?? r.customer ?? r.Customer ?? r.name ?? r.Name ?? '',
          ).trim()
          if (!customer) return null
          const phone = String(get(r, 'phone', 'number') ?? r.phone ?? r.Phone ?? '').trim()
          const email = String(get(r, 'email') ?? r.email ?? r.Email ?? '').trim()
          const location = String(get(r, 'location') ?? r.location ?? r.Location ?? '').trim()
          const riderAssigned = String(get(r, 'rider assigned', 'rider') ?? '').trim()
          const amountToBeCollectedGhs = parseMoney(
            get(r, 'amount to be collected', 'amount_to_be_collected') ?? '',
          )
          const acCashCollectedGhs = parseMoney(get(r, 'ac cash collected', 'ac cash') ?? '')
          const acMomoGhs = parseMoney(get(r, 'ac momo', 'acmomo') ?? '')
          const acPaystackGhs = parseMoney(get(r, 'ac paystack', 'paystack') ?? '')
          const remarks = String(get(r, 'remarks', 'remark', 'notes') ?? '').trim()

          const sourceRaw = String(get(r, 'source') ?? r.source ?? r.Source ?? '').trim().toLowerCase()
          const joinDateRaw = String(get(r, 'joindate', 'join date', 'join_date') ?? r.joinDate ?? r.JoinDate ?? r.join_date ?? '').trim()
          const segmentRaw = String(get(r, 'segment') ?? r.segment ?? r.Segment ?? '').trim()

          const source =
            sourceRaw === 'walk_in' || sourceRaw === 'walk in'
              ? 'walk_in'
              : sourceRaw === 'instagram'
                ? 'instagram'
                : sourceRaw === 'web'
                  ? 'web'
                  : sourceRaw === 'referral'
                    ? 'referral'
                    : sourceRaw === 'sales_rep' || sourceRaw === 'sales rep'
                      ? 'sales_rep'
                      : sourceRaw
                        ? 'other'
                        : undefined

          let joinDate: string | undefined
          if (joinDateRaw) {
            const d = new Date(joinDateRaw)
            if (!Number.isNaN(d.getTime())) joinDate = d.toISOString()
          }

          const segment =
            segmentRaw === 'High LTV' || segmentRaw === 'At risk' || segmentRaw === 'New (30d)' || segmentRaw === 'Core'
              ? (segmentRaw as any)
              : undefined

          return {
            customer,
            phone: phone || undefined,
            email: email || undefined,
            location: location || undefined,
            source,
            joinDate,
            segment,
            riderAssigned: riderAssigned || undefined,
            amountToBeCollectedGhs,
            acCashCollectedGhs,
            acMomoGhs,
            acPaystackGhs,
            remarks: remarks || undefined,
          }
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))

      if (rows.length === 0) {
        toast.error('No valid customer rows found (missing customer name)')
        return
      }

      const res = await fetch('/api/dtc/customers/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Import failed')
      }

      toast.success(`Imported ${rows.length.toLocaleString()} rows`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
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
          email: createForm.email.trim() || undefined,
          location: createForm.location.trim() || undefined,
          source: createForm.source,
          joinDate: createForm.joinDate ? new Date(createForm.joinDate).toISOString() : undefined,
          segment: createForm.segment,
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
        email: '',
        location: '',
        source: 'instagram',
        joinDate: new Date().toISOString().slice(0, 10),
        segment: 'Core',
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
        description="Segment DTC buyers, compare lifetime value, and spot churn risk before sell-out momentum drops."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              disabled={importing || loading}
              onClick={() => document.getElementById('ci-import')?.click()}
            >
              <Download className="h-4 w-4" />
              Import Excel
            </Button>
            <input
              id="ci-import"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void handleImportExcel(f)
              }}
            />
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5" type="button">
                  <Plus className="h-4 w-4" />
                  Add customer
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <form onSubmit={handleCreateCustomer}>
                  <DialogHeader>
                    <DialogTitle>Add customer</DialogTitle>
                    <DialogDescription>
                      Adds a customer record so they appear in segmentation even before orders are logged.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="new-customer">Customer name</Label>
                        <Input
                          id="new-customer"
                          value={createForm.customer}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, customer: e.target.value }))
                          }
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
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, phone: e.target.value }))
                          }
                          placeholder="+233 20 000 0000"
                          inputMode="tel"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customer-email">Email</Label>
                        <Input
                          id="customer-email"
                          value={createForm.email}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, email: e.target.value }))
                          }
                          placeholder="buyer@company.com"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="customer-location">Location</Label>
                        <Input
                          id="customer-location"
                          value={createForm.location}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, location: e.target.value }))
                          }
                          placeholder="Accra, Ghana"
                          autoComplete="address-level2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Source</Label>
                        <Select
                          value={createForm.source}
                          onValueChange={(v) =>
                            setCreateForm((f) => ({ ...f, source: v as CustomerRow['source'] }))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="instagram">Instagram</SelectItem>
                            <SelectItem value="web">Web</SelectItem>
                            <SelectItem value="walk_in">Walk-in</SelectItem>
                            <SelectItem value="referral">Referral</SelectItem>
                            <SelectItem value="sales_rep">Sales rep</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="customer-join-date">Join date</Label>
                        <Input
                          id="customer-join-date"
                          type="date"
                          value={createForm.joinDate}
                          onChange={(e) =>
                            setCreateForm((f) => ({ ...f, joinDate: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Segment</Label>
                        <Select
                          value={createForm.segment}
                          onValueChange={(v) =>
                            setCreateForm((f) => ({ ...f, segment: v as CustomerRow['segment'] }))
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
              Avg LTV
            </p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? '—' : formatGhs(totals.avgLtv)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Based on all sell-out orders</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-indigo-600">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              High LTV
            </p>
            <p className="mt-2 text-2xl font-bold">
              {loading ? '—' : segments?.highLtv ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">LTV ≥ GHS 2,000 or 10+ orders</p>
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

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
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
          {query ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')}>
              Clear
            </Button>
          ) : null}
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Customer segments
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
          ) : filtered.length === 0 ? (
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
                      ? 'Create DTC orders first; customers are derived from order history.'
                      : 'Try a different search term.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">LTV</TableHead>
                  <TableHead className="hidden lg:table-cell">Source</TableHead>
                  <TableHead className="hidden md:table-cell">Last order</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const last = c.lastOrderAt ? new Date(c.lastOrderAt) : null
                  const isAtRisk = c.segment === 'At risk'
                  return (
                    <TableRow key={c.customer}>
                      <TableCell className="font-medium">{c.customer}</TableCell>
                      <TableCell>{segmentBadge(c.segment)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.orders}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {c.ltvFormatted}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {c.source.replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'hidden md:table-cell text-muted-foreground',
                          isAtRisk && 'text-red-600',
                        )}
                      >
                        {last ? formatDistanceToNowStrict(last, { addSuffix: true }) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  )
}

