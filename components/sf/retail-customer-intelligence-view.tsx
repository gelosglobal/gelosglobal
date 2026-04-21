'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { Download, Loader2, Store } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatGhs } from '@/lib/dtc-orders'

type RetailCustomerRow = {
  outletName: string
  invoices: number
  invoicedNetGhs: number
  paidGhs: number
  balanceGhs: number
  firstInvoiceAt: string
  lastInvoiceAt: string
  segment: 'High value' | 'At risk' | 'New (30d)' | 'Core'
}

type Segments = {
  highValue: number
  atRisk: number
  new30d: number
  core: number
}

function segBadge(seg: RetailCustomerRow['segment']) {
  switch (seg) {
    case 'High value':
      return <Badge className="bg-indigo-600 hover:bg-indigo-600">High value</Badge>
    case 'At risk':
      return <Badge variant="destructive">At risk</Badge>
    case 'New (30d)':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">New</Badge>
    default:
      return <Badge variant="outline">Core</Badge>
  }
}

export function RetailCustomerIntelligenceView() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<RetailCustomerRow[]>([])
  const [segments, setSegments] = useState<Segments | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string>('')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sf/customer-intelligence', { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const data = (await res.json()) as {
        rows: RetailCustomerRow[]
        segments: Segments
        generatedAt: string
      }
      setRows(data.rows)
      setSegments(data.segments)
      setGeneratedAt(data.generatedAt)
    } catch {
      toast.error('Could not load retail customer intelligence')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.outletName.toLowerCase().includes(q) || r.segment.toLowerCase().includes(q))
  }, [rows, query])

  const totals = useMemo(() => {
    let invoiced = 0
    let paid = 0
    let balance = 0
    for (const r of filtered) {
      invoiced += Number(r.invoicedNetGhs) || 0
      paid += Number(r.paidGhs) || 0
      balance += Number(r.balanceGhs) || 0
    }
    return { invoiced, paid, balance, count: filtered.length }
  }, [filtered])

  function exportCsv() {
    if (rows.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = ['outletName', 'segment', 'invoices', 'invoicedNetGhs', 'paidGhs', 'balanceGhs', 'firstInvoiceAt', 'lastInvoiceAt']
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          esc(r.outletName),
          r.segment,
          r.invoices,
          r.invoicedNetGhs,
          r.paidGhs,
          r.balanceGhs,
          r.firstInvoiceAt,
          r.lastInvoiceAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `retail-customer-intelligence-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  function exportExcel() {
    if (rows.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((r) => ({
        outletName: r.outletName,
        segment: r.segment,
        invoices: r.invoices,
        invoicedNetGhs: r.invoicedNetGhs,
        paidGhs: r.paidGhs,
        balanceGhs: r.balanceGhs,
        firstInvoiceAt: r.firstInvoiceAt,
        lastInvoiceAt: r.lastInvoiceAt,
      })),
    )
    XLSX.utils.book_append_sheet(wb, sheet, 'Outlets')
    const seg = XLSX.utils.json_to_sheet([
      {
        highValue: segments?.highValue ?? 0,
        atRisk: segments?.atRisk ?? 0,
        new30d: segments?.new30d ?? 0,
        core: segments?.core ?? 0,
      },
    ])
    XLSX.utils.book_append_sheet(wb, seg, 'Segments')
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `retail-customer-intelligence-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Excel download started')
  }

  const updatedLabel = useMemo(() => {
    if (!generatedAt) return null
    return `Updated ${formatDistanceToNowStrict(new Date(generatedAt), { addSuffix: true })}`
  }, [generatedAt])

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden">
      <SfPageHeader
        title="Retail Customer Intelligence"
        description="Outlet-level receivables intelligence derived from B2B Payments invoices (net invoiced, paid, balance, and recency)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCsv} disabled={loading || rows.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel} disabled={loading || rows.length === 0}>
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 min-w-0 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {updatedLabel ? <p className="text-xs text-muted-foreground">{updatedLabel}</p> : null}

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outlets</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{loading ? '—' : rows.length.toLocaleString()}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invoiced (net)</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{loading ? '—' : formatGhs(totals.invoiced)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paid</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{loading ? '—' : formatGhs(totals.paid)}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-amber-600">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Balance</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{loading ? '—' : formatGhs(totals.balance)}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-indigo-600">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">High value</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{loading ? '—' : segments?.highValue ?? 0}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-red-600">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">At risk</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{loading ? '—' : segments?.atRisk ?? 0}</p>
          </Card>
        </div>

        <div className="max-w-md space-y-2">
          <Label htmlFor="retail-ci-search" className="text-muted-foreground">
            Search outlets
          </Label>
          <Input
            id="retail-ci-search"
            placeholder="Outlet name or segment…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading || rows.length === 0}
          />
          {query.trim() ? (
            <p className="text-xs text-muted-foreground">
              {totals.count.toLocaleString()} outlets · Invoiced {formatGhs(totals.invoiced)} · Paid {formatGhs(totals.paid)} · Balance {formatGhs(totals.balance)}
            </p>
          ) : null}
        </div>

        <Card className="p-0 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Store className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>{rows.length === 0 ? 'No outlets yet' : 'No matches'}</EmptyTitle>
                  <EmptyDescription>
                    {rows.length === 0
                      ? 'Add B2B invoices first; outlets are derived from invoice history.'
                      : 'Try a different search term.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="max-w-full overflow-x-auto">
              <Table className="min-w-[980px] w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Segment</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead className="text-right">Invoiced (net)</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="hidden md:table-cell">Last invoice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const last = r.lastInvoiceAt ? new Date(r.lastInvoiceAt) : null
                    return (
                      <TableRow key={r.outletName}>
                        <TableCell className="font-medium">{r.outletName}</TableCell>
                        <TableCell>{segBadge(r.segment)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.invoices}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{formatGhs(r.invoicedNetGhs)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatGhs(r.paidGhs)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatGhs(r.balanceGhs)}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {last ? formatDistanceToNowStrict(last, { addSuffix: true }) : '—'}
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
    </div>
  )
}

