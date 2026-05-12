'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Download, Loader2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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

type ProductRow = {
  key: string
  name: string
  sku: string | null
  units7d: number
  revenue7d: number
  unitsPrev7d: number
  revenuePrev7d: number
  wowRevenuePercent: number | null
  isNew: boolean
}

type Highlights = {
  topRevenue: {
    name: string
    sku: string | null
    revenue: number
    units: number
  } | null
  fastestGrowing: {
    name: string
    sku: string | null
    wowPercent: number
  } | null
}

function formatWow(p: number | null, isNew: boolean) {
  if (isNew && p === null) {
    return <Badge variant="outline">New</Badge>
  }
  if (p === null) {
    return <span className="text-muted-foreground">—</span>
  }
  const rounded = Math.round(p * 10) / 10
  const positive = rounded >= 0
  return (
    <span className={positive ? 'font-medium text-emerald-600' : 'font-medium text-red-600'}>
      {positive ? '+' : ''}
      {rounded}%
    </span>
  )
}

type RangePreset = '7d' | '1m' | '3m' | '6m' | '12m' | 'custom'

export function SfProductPerformanceView() {
  const [rows, setRows] = useState<ProductRow[]>([])
  const [highlights, setHighlights] = useState<Highlights | null>(null)
  const [periodLabel, setPeriodLabel] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const unitHighlights = useMemo(() => {
    const sold = rows.filter((r) => (Number(r.units7d ?? 0) || 0) > 0)
    let top: ProductRow | null = null
    let bottom: ProductRow | null = null
    for (const r of sold) {
      if (!top || r.units7d > top.units7d) top = r
      if (!bottom || r.units7d < bottom.units7d) bottom = r
    }
    return { topUnits: top, lowestUnits: bottom }
  }, [rows])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('preset', rangePreset)
      if (rangePreset === 'custom') {
        if (from) params.set('from', from)
        if (to) params.set('to', to)
      }
      const res = await fetch(`/api/sf/product-performance?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error || 'Failed to load')
      }
      const data = (await res.json()) as {
        rows: ProductRow[]
        highlights: Highlights
        period: { label: string }
      }
      setRows(data.rows)
      setHighlights(data.highlights)
      setPeriodLabel(data.period.label)
    } catch {
      toast.error('Could not load retail product performance')
    } finally {
      setLoading(false)
    }
  }, [rangePreset, from, to])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.sku?.toLowerCase().includes(q) ?? false),
    )
  }, [rows, query])

  function handleExport() {
    if (rows.length === 0) {
      toast.message('No product rows to export')
      return
    }
    const header = [
      'name',
      'sku',
      'unitsCurrent',
      'revenueCurrent',
      'unitsPrior',
      'revenuePrior',
      'wowRevenuePercent',
      'isNew',
    ]
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          `"${r.name.replace(/"/g, '""')}"`,
          r.sku ? `"${r.sku.replace(/"/g, '""')}"` : '',
          r.units7d,
          r.revenue7d,
          r.unitsPrev7d,
          r.revenuePrev7d,
          r.wowRevenuePercent ?? '',
          r.isNew,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `retail-product-performance-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Product Performance"
        description="Retail sell-out by SKU: revenue and units from Sales Force outlet orders and B2B invoice lines, compared to the prior period of equal length."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExport}
            disabled={loading || rows.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {periodLabel ? (
          <p className="text-xs text-muted-foreground">{periodLabel}</p>
        ) : null}

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Date range</Label>
            <Select value={rangePreset} onValueChange={(v) => setRangePreset(v as RangePreset)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="1m">Last 1 month</SelectItem>
                <SelectItem value="3m">Last 3 months</SelectItem>
                <SelectItem value="6m">Last 6 months</SelectItem>
                <SelectItem value="12m">Last 12 months</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {rangePreset === 'custom' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="sf-pp-from" className="text-muted-foreground">
                  From
                </Label>
                <Input
                  id="sf-pp-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-pp-to" className="text-muted-foreground">
                  To
                </Label>
                <Input
                  id="sf-pp-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  disabled={loading}
                />
              </div>
            </>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Top SKU revenue</p>
            {loading ? (
              <div className="mt-6 flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : highlights?.topRevenue ? (
              <>
                <p className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                  {highlights.topRevenue.name}
                </p>
                {highlights.topRevenue.sku ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {highlights.topRevenue.sku}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {formatGhs(highlights.topRevenue.revenue)} ·{' '}
                  {highlights.topRevenue.units.toLocaleString()} units
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No line-item revenue in the selected window yet.
              </p>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Fastest growing (revenue vs prior)
            </p>
            {loading ? (
              <div className="mt-6 flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : highlights?.fastestGrowing ? (
              <>
                <p className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                  {highlights.fastestGrowing.name}
                </p>
                {highlights.fastestGrowing.sku ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {highlights.fastestGrowing.sku}
                  </p>
                ) : null}
                <p className="mt-2 flex items-center gap-1 text-sm text-emerald-600">
                  <ArrowUpRight className="h-4 w-4" />+
                  {(Math.round(highlights.fastestGrowing.wowPercent * 10) / 10).toFixed(1)}% vs prior
                  period
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Needs revenue in both windows. New SKUs show as &quot;New&quot; in the table.
              </p>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Best selling (units)</p>
            {loading ? (
              <div className="mt-6 flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : unitHighlights.topUnits ? (
              <>
                <p className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                  {unitHighlights.topUnits.name}
                </p>
                {unitHighlights.topUnits.sku ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {unitHighlights.topUnits.sku}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {unitHighlights.topUnits.units7d.toLocaleString()} units ·{' '}
                  {formatGhs(unitHighlights.topUnits.revenue7d)}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No units sold in this range yet.</p>
            )}
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Lowest selling (units)</p>
            {loading ? (
              <div className="mt-6 flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : unitHighlights.lowestUnits ? (
              <>
                <p className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                  {unitHighlights.lowestUnits.name}
                </p>
                {unitHighlights.lowestUnits.sku ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {unitHighlights.lowestUnits.sku}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  {unitHighlights.lowestUnits.units7d.toLocaleString()} units ·{' '}
                  {formatGhs(unitHighlights.lowestUnits.revenue7d)}
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">No units sold in this range yet.</p>
            )}
          </Card>
        </div>

        <div className="max-w-md space-y-2">
          <Label htmlFor="sf-pp-search" className="text-muted-foreground">
            Search products
          </Label>
          <Input
            id="sf-pp-search"
            placeholder="Name or SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading || rows.length === 0}
          />
        </div>

        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Retail assortment snapshot</h2>
            {rows.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {filtered.length} of {rows.length} SKUs
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TrendingUp className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No product data yet</EmptyTitle>
                <EmptyDescription>
                  Add line items on Sales Force outlet orders or B2B invoices. This view rolls up units
                  and revenue by product for the selected date range and the prior period.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Units (current)</TableHead>
                  <TableHead className="text-right">Revenue (current)</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Rev (prior)</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.key}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                      {p.sku ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.units7d.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatGhs(p.revenue7d)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                      {formatGhs(p.revenuePrev7d)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatWow(p.wowRevenuePercent, p.isNew)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {!loading && rows.length > 0 && filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No products match your search.</p>
        ) : null}
      </div>
    </div>
  )
}
