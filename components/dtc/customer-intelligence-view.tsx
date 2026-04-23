'use client'

import { useEffect, useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Download, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react'
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

/** Must match `app/api/dtc/customers/reset/route.ts`. */
const CLEAR_DTC_CUSTOMERS_CONFIRM = 'CLEAR_ALL_DTC_CUSTOMERS'

export type CustomerIntelLedgerRow = {
  id: string
  orderedAt: string | null
  orderNumber: string
  customerName: string
  phoneNumber: string
  location: string
  riderAssigned: string
  amountToCollectGhs: number
  cashCollectedGhs: number
  momoCollectedGhs: number
  paystackCollectedGhs: number
  totalCollectedGhs: number
  paymentMethod: string
  deliveryStatus: string
  remarks: string
  additionalRemarks: string
}

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

type CustomerSortKey = 'date' | 'amountToCollect' | 'totalCollected' | 'name'

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
  const [ledgerRows, setLedgerRows] = useState<CustomerIntelLedgerRow[]>([])
  const [segments, setSegments] = useState<SegmentCounts | null>(null)
  const [query, setQuery] = useState('')
  const [importing, setImporting] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearPhrase, setClearPhrase] = useState('')
  const [clearing, setClearing] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(false)
  const [editRow, setEditRow] = useState<CustomerIntelLedgerRow | null>(null)
  const [editForm, setEditForm] = useState({
    date: '',
    orderNumber: '',
    customerName: '',
    phoneNumber: '',
    location: '',
    riderAssigned: '',
    amountToCollectGhs: '',
    cashCollectedGhs: '',
    momoCollectedGhs: '',
    paystackCollectedGhs: '',
    totalCollectedGhs: '',
    paymentMethod: '',
    deliveryStatus: '',
    remarks: '',
    additionalRemarks: '',
  })
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sortBy, setSortBy] = useState<CustomerSortKey>('date')
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
      const [ledgerRes, customersRes] = await Promise.all([
        fetch('/api/dtc/customer-intelligence', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/dtc/customers', { credentials: 'include', cache: 'no-store' }),
      ])
      if (ledgerRes.status === 401 || customersRes.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!ledgerRes.ok || !customersRes.ok) throw new Error('Failed to load customer intelligence')

      const ledgerJson = (await ledgerRes.json()) as { rows: CustomerIntelLedgerRow[] }
      const customersJson = (await customersRes.json()) as {
        customers: CustomerRow[]
        segments: SegmentCounts
      }
      setLedgerRows(Array.isArray(ledgerJson.rows) ? ledgerJson.rows : [])
      setCustomers(customersJson.customers)
      setSegments(customersJson.segments)
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
      ? [...ledgerRows]
      : ledgerRows.filter((r) => {
          const hay = [
            r.customerName,
            r.phoneNumber,
            r.location,
            r.riderAssigned,
            r.orderNumber,
            r.paymentMethod,
            r.deliveryStatus,
            r.remarks,
            r.additionalRemarks,
          ]
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })

    base.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.customerName.localeCompare(b.customerName)
        case 'amountToCollect':
          return (b.amountToCollectGhs ?? 0) - (a.amountToCollectGhs ?? 0)
        case 'totalCollected':
          return (b.totalCollectedGhs ?? 0) - (a.totalCollectedGhs ?? 0)
        case 'date':
        default: {
          const ta = a.orderedAt ? new Date(a.orderedAt).getTime() : 0
          const tb = b.orderedAt ? new Date(b.orderedAt).getTime() : 0
          return tb - ta
        }
      }
    })

    return base
  }, [ledgerRows, query, sortBy])

  const totals = useMemo(() => {
    const totalCustomers = customers.length
    const totalBilled = customers.reduce((sum, c) => sum + c.totalBilled, 0)
    const avgTotalBilled = totalCustomers === 0 ? 0 : totalBilled / totalCustomers
    return { totalCustomers, totalBilled, avgTotalBilled }
  }, [customers])

  function handleExport() {
    if (ledgerRows.length === 0) {
      toast.message('No rows to export yet')
      return
    }
    const header = [
      '#',
      'Date',
      'Order #',
      'Customer Name',
      'Phone Number',
      'Location',
      'Rider Assigned',
      'Amount to Collect (GHC)',
      'Cash Collected (GHC)',
      'MoMo Collected (GHC)',
      'Paystack Collected (GHC)',
      'Total Collected (GHC)',
      'Payment Method',
      'Delivery Status',
      'Remarks',
      'Additional Remarks',
    ]
    const lines = [
      header.join(','),
      ...ledgerRows.map((r, i) =>
        [
          i + 1,
          r.orderedAt ? r.orderedAt.slice(0, 10) : '',
          `"${(r.orderNumber ?? '').replace(/"/g, '""')}"`,
          `"${(r.customerName ?? '').replace(/"/g, '""')}"`,
          `"${(r.phoneNumber ?? '').replace(/"/g, '""')}"`,
          `"${(r.location ?? '').replace(/"/g, '""')}"`,
          `"${(r.riderAssigned ?? '').replace(/"/g, '""')}"`,
          r.amountToCollectGhs,
          r.cashCollectedGhs,
          r.momoCollectedGhs,
          r.paystackCollectedGhs,
          r.totalCollectedGhs,
          `"${(r.paymentMethod ?? '').replace(/"/g, '""')}"`,
          `"${(r.deliveryStatus ?? '').replace(/"/g, '""')}"`,
          `"${(r.remarks ?? '').replace(/"/g, '""')}"`,
          `"${(r.additionalRemarks ?? '').replace(/"/g, '""')}"`,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-customer-intelligence-ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  function handleExportExcel() {
    if (ledgerRows.length === 0) {
      toast.message('No rows to export yet')
      return
    }

    const wb = XLSX.utils.book_new()

    const sheet = XLSX.utils.json_to_sheet(
      ledgerRows.map((r, i) => ({
        '#': i + 1,
        Date: r.orderedAt ? r.orderedAt.slice(0, 10) : '',
        'Order #': r.orderNumber,
        'Customer Name': r.customerName,
        'Phone Number': r.phoneNumber,
        Location: r.location,
        'Rider Assigned': r.riderAssigned,
        'Amount to Collect (GHC)': r.amountToCollectGhs,
        'Cash Collected (GHC)': r.cashCollectedGhs,
        'MoMo Collected (GHC)': r.momoCollectedGhs,
        'Paystack Collected (GHC)': r.paystackCollectedGhs,
        'Total Collected (GHC)': r.totalCollectedGhs,
        'Payment Method': r.paymentMethod,
        'Delivery Status': r.deliveryStatus,
        Remarks: r.remarks,
        'Additional Remarks': r.additionalRemarks,
      })),
    )
    XLSX.utils.book_append_sheet(wb, sheet, 'Customer Intelligence')

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dtc-customer-intelligence-ledger-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel download started')
  }

  async function handleImportExcel(file: File) {
    setImporting(true)
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await fetch('/api/dtc/customer-intelligence/import-file', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        ledgerRowCount?: number
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Import failed')
      }
      toast.success(`Imported ${Number(data.ledgerRowCount ?? 0).toLocaleString()} rows`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleResetCustomers() {
    const phrase = clearPhrase.trim()
    if (phrase !== CLEAR_DTC_CUSTOMERS_CONFIRM) {
      toast.error(`Type ${CLEAR_DTC_CUSTOMERS_CONFIRM} to confirm`)
      return
    }
    setClearing(true)
    try {
      const res = await fetch('/api/dtc/customer-intelligence/reset', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: CLEAR_DTC_CUSTOMERS_CONFIRM }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string
        deletedLedgerRows?: number
      }
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not clear customers')
      }
      toast.success(`Cleared ${Number(data.deletedLedgerRows ?? 0).toLocaleString()} rows`)
      setClearOpen(false)
      setClearPhrase('')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not clear customers')
    } finally {
      setClearing(false)
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

  function openEditRow(r: CustomerIntelLedgerRow) {
    setEditRow(r)
    setEditForm({
      date: r.orderedAt ? r.orderedAt.slice(0, 10) : '',
      orderNumber: r.orderNumber ?? '',
      customerName: r.customerName ?? '',
      phoneNumber: r.phoneNumber ?? '',
      location: r.location ?? '',
      riderAssigned: r.riderAssigned ?? '',
      amountToCollectGhs: String(r.amountToCollectGhs ?? 0),
      cashCollectedGhs: String(r.cashCollectedGhs ?? 0),
      momoCollectedGhs: String(r.momoCollectedGhs ?? 0),
      paystackCollectedGhs: String(r.paystackCollectedGhs ?? 0),
      totalCollectedGhs: String(r.totalCollectedGhs ?? 0),
      paymentMethod: r.paymentMethod ?? '',
      deliveryStatus: r.deliveryStatus ?? '',
      remarks: r.remarks ?? '',
      additionalRemarks: r.additionalRemarks ?? '',
    })
    setEditOpen(true)
  }

  async function submitEditRow(e: React.FormEvent) {
    e.preventDefault()
    if (!editRow) return
    const name = editForm.customerName.trim()
    if (!name) {
      toast.error('Enter a customer name')
      return
    }
    setEditingRow(true)
    try {
      const res = await fetch(`/api/dtc/customer-intelligence/${editRow.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editForm.date.trim() || undefined,
          orderNumber: editForm.orderNumber.trim() || undefined,
          customerName: name,
          phoneNumber: editForm.phoneNumber.trim() || undefined,
          location: editForm.location.trim() || undefined,
          riderAssigned: editForm.riderAssigned.trim() || undefined,
          amountToCollectGhs:
            editForm.amountToCollectGhs.trim() === '' ? undefined : Number(editForm.amountToCollectGhs),
          cashCollectedGhs:
            editForm.cashCollectedGhs.trim() === '' ? undefined : Number(editForm.cashCollectedGhs),
          momoCollectedGhs:
            editForm.momoCollectedGhs.trim() === '' ? undefined : Number(editForm.momoCollectedGhs),
          paystackCollectedGhs:
            editForm.paystackCollectedGhs.trim() === ''
              ? undefined
              : Number(editForm.paystackCollectedGhs),
          totalCollectedGhs:
            editForm.totalCollectedGhs.trim() === '' ? undefined : Number(editForm.totalCollectedGhs),
          paymentMethod: editForm.paymentMethod.trim() || undefined,
          deliveryStatus: editForm.deliveryStatus.trim() || undefined,
          remarks: editForm.remarks.trim() || undefined,
          additionalRemarks: editForm.additionalRemarks.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not save row')
      toast.success('Row updated')
      setEditOpen(false)
      setEditRow(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save row')
    } finally {
      setEditingRow(false)
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
                  <SelectItem value="date">Date (recent first)</SelectItem>
                  <SelectItem value="amountToCollect">Amount to collect (high first)</SelectItem>
                  <SelectItem value="totalCollected">Total collected (high first)</SelectItem>
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
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap">Order #</TableHead>
                  <TableHead className="min-w-[10rem] whitespace-nowrap">Customer Name</TableHead>
                  <TableHead className="min-w-[7rem] whitespace-nowrap">Phone Number</TableHead>
                  <TableHead className="min-w-[8rem] whitespace-nowrap">Location</TableHead>
                  <TableHead className="min-w-[8rem] whitespace-nowrap">Rider Assigned</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Amount to Collect (GHC)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Cash Collected (GHC)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">MoMo Collected (GHC)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Paystack Collected (GHC)</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Total Collected (GHC)</TableHead>
                  <TableHead className="whitespace-nowrap">Payment Method</TableHead>
                  <TableHead className="whitespace-nowrap">Delivery Status</TableHead>
                  <TableHead className="min-w-[12rem] whitespace-nowrap">Remarks</TableHead>
                  <TableHead className="min-w-[12rem] whitespace-nowrap">Additional Remarks</TableHead>
                  <TableHead className="w-[64px] text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((c, i) => {
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-right text-muted-foreground tabular-nums text-sm">
                        {i + 1}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.orderedAt ? fmtTableDate(c.orderedAt.slice(0, 10)) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {c.orderNumber || '—'}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{c.customerName}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums whitespace-nowrap">
                        {c.phoneNumber || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.location || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.riderAssigned || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(c.amountToCollectGhs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(c.cashCollectedGhs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(c.momoCollectedGhs)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatGhs(c.paystackCollectedGhs)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatGhs(c.totalCollectedGhs)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.paymentMethod || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {c.deliveryStatus || '—'}
                      </TableCell>
                      <TableCell className="max-w-[18rem] truncate text-muted-foreground" title={c.remarks}>
                        {c.remarks || '—'}
                      </TableCell>
                      <TableCell
                        className="max-w-[18rem] truncate text-muted-foreground"
                        title={c.additionalRemarks}
                      >
                        {c.additionalRemarks || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditRow(c)}
                          aria-label="Edit row"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open)
          if (!open) setEditRow(null)
        }}
      >
        <DialogContent className="!flex min-h-0 max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <form onSubmit={submitEditRow} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 space-y-2 border-b border-border px-6 pt-6 pb-4 pr-12 text-left">
              <DialogTitle>Edit row</DialogTitle>
              <DialogDescription>Updates the Customer Intelligence row.</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-date">Date</Label>
                  <Input
                    id="ci-edit-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-order">Order #</Label>
                  <Input
                    id="ci-edit-order"
                    value={editForm.orderNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, orderNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-name">Customer Name</Label>
                  <Input
                    id="ci-edit-name"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm((f) => ({ ...f, customerName: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-phone">Phone Number</Label>
                  <Input
                    id="ci-edit-phone"
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-location">Location</Label>
                  <Input
                    id="ci-edit-location"
                    value={editForm.location}
                    onChange={(e) => setEditForm((f) => ({ ...f, location: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-rider">Rider Assigned</Label>
                  <Input
                    id="ci-edit-rider"
                    value={editForm.riderAssigned}
                    onChange={(e) => setEditForm((f) => ({ ...f, riderAssigned: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-paymethod">Payment Method</Label>
                  <Input
                    id="ci-edit-paymethod"
                    value={editForm.paymentMethod}
                    onChange={(e) => setEditForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-status">Delivery Status</Label>
                  <Input
                    id="ci-edit-status"
                    value={editForm.deliveryStatus}
                    onChange={(e) => setEditForm((f) => ({ ...f, deliveryStatus: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-amt">Amount to Collect (GHC)</Label>
                  <Input
                    id="ci-edit-amt"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.amountToCollectGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, amountToCollectGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-cash">Cash Collected (GHC)</Label>
                  <Input
                    id="ci-edit-cash"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.cashCollectedGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, cashCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-momo">MoMo Collected (GHC)</Label>
                  <Input
                    id="ci-edit-momo"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.momoCollectedGhs}
                    onChange={(e) => setEditForm((f) => ({ ...f, momoCollectedGhs: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ci-edit-paystack">Paystack Collected (GHC)</Label>
                  <Input
                    id="ci-edit-paystack"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.paystackCollectedGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, paystackCollectedGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-total">Total Collected (GHC)</Label>
                  <Input
                    id="ci-edit-total"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.totalCollectedGhs}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, totalCollectedGhs: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-remarks">Remarks</Label>
                  <Input
                    id="ci-edit-remarks"
                    value={editForm.remarks}
                    onChange={(e) => setEditForm((f) => ({ ...f, remarks: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ci-edit-additional">Additional Remarks</Label>
                  <Input
                    id="ci-edit-additional"
                    value={editForm.additionalRemarks}
                    onChange={(e) => setEditForm((f) => ({ ...f, additionalRemarks: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={editingRow}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editingRow}>
                {editingRow ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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

