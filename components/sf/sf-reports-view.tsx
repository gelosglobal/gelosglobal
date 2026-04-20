'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatGhs } from '@/lib/dtc-orders'

type Snapshot = {
  generatedAt: string
  range: { from: string; to: string }
  kpis: {
    completedVisits: number
    sellInGhs: number
    activeReps: number
    outletsVisited: number
    activeOutlets: number
    coveragePct: number | null
  }
  repPerformance: Array<{
    rep: string
    visits: number
    sellInGhs: number
    outletsVisited: number
  }>
  outletActivity: Array<{
    outlet: string
    visits: number
    sellInGhs: number
    reps: number
    lastVisitedAt: string
  }>
}

function dateToInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

export function SfReportsView() {
  const defaultTo = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return d
  }, [])

  const [from, setFrom] = useState(() => dateToInput(defaultFrom))
  const [to, setTo] = useState(() => dateToInput(defaultTo))
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Snapshot | null>(null)
  const [repQuery, setRepQuery] = useState('')
  const [outletQuery, setOutletQuery] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (from.trim()) qs.set('from', from.trim())
      if (to.trim()) qs.set('to', to.trim())
      const res = await fetch(`/api/sf/reports?${qs.toString()}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      setData((await res.json()) as Snapshot)
    } catch {
      toast.error('Could not load SF reports')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const repFiltered = useMemo(() => {
    const q = repQuery.trim().toLowerCase()
    if (!data) return []
    if (!q) return data.repPerformance
    return data.repPerformance.filter((r) => r.rep.toLowerCase().includes(q))
  }, [data, repQuery])

  const outletFiltered = useMemo(() => {
    const q = outletQuery.trim().toLowerCase()
    if (!data) return []
    if (!q) return data.outletActivity
    return data.outletActivity.filter((o) => o.outlet.toLowerCase().includes(q))
  }, [data, outletQuery])

  function exportRepCsv() {
    if (!data || data.repPerformance.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = ['rep', 'visits', 'outletsVisited', 'sellInGhs']
    const lines = [
      header.join(','),
      ...data.repPerformance.map((r) =>
        [
          csvEscape(r.rep),
          r.visits,
          r.outletsVisited,
          r.sellInGhs,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sf-rep-performance-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  function exportOutletCsv() {
    if (!data || data.outletActivity.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = ['outlet', 'visits', 'reps', 'sellInGhs', 'lastVisitedAt']
    const lines = [
      header.join(','),
      ...data.outletActivity.map((o) =>
        [
          csvEscape(o.outlet),
          o.visits,
          o.reps,
          o.sellInGhs,
          o.lastVisitedAt,
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sf-outlet-activity-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  const updatedLabel = useMemo(() => {
    if (!data) return null
    return `Updated ${format(new Date(data.generatedAt), 'd MMM · HH:mm')}`
  }, [data])

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Retail Reports"
        description="A reporting hub for field activity. Uses completed shop visits (sf_visits) to compute rep performance and outlet coverage."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-sm text-muted-foreground">{updatedLabel}</div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-2">
              <Label htmlFor="sf-r-from" className="text-muted-foreground">
                From
              </Label>
              <Input id="sf-r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf-r-to" className="text-muted-foreground">
                To
              </Label>
              <Input id="sf-r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Completed visits</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (data?.kpis.completedVisits ?? 0)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Sell-in</p>
            <p className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">
              {loading ? '—' : formatGhs(data?.kpis.sellInGhs ?? 0)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Active reps</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (data?.kpis.activeReps ?? 0)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Outlets visited</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? '—' : (data?.kpis.outletsVisited ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Active outlets: {loading ? '—' : (data?.kpis.activeOutlets ?? 0)}
            </p>
          </Card>
          <Card className="border-l-4 border-l-blue-600 p-5 lg:col-span-2">
            <p className="text-xs font-medium uppercase text-muted-foreground">Coverage</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <p className="text-3xl font-bold tabular-nums">
                {loading
                  ? '—'
                  : data?.kpis.coveragePct == null
                    ? '—'
                    : `${data.kpis.coveragePct}%`}
              </p>
              {!loading && data?.kpis.coveragePct != null ? (
                <Badge variant={data.kpis.coveragePct >= 75 ? 'secondary' : 'outline'}>
                  {data.kpis.outletsVisited}/{data.kpis.activeOutlets}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Outlets visited ÷ active outlets (fallback uses last 30d if none registered)
            </p>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-0">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Rep performance</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search rep…"
                  value={repQuery}
                  onChange={(e) => setRepQuery(e.target.value)}
                  className="h-9 w-full sm:w-56"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={exportRepCsv}
                  disabled={loading || !data || data.repPerformance.length === 0}
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : !data || data.repPerformance.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No completed visits in range.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rep</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Outlets</TableHead>
                    <TableHead className="text-right">Sell-in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {repFiltered.map((r) => (
                    <TableRow key={r.rep}>
                      <TableCell className="font-medium">{r.rep}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.outletsVisited}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatGhs(r.sellInGhs)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loading && data && data.repPerformance.length > 0 && repFiltered.length === 0 ? (
              <p className="px-6 py-4 text-center text-sm text-muted-foreground">
                No reps match your search.
              </p>
            ) : null}
          </Card>

          <Card className="p-0">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide">Outlet activity</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Search outlet…"
                  value={outletQuery}
                  onChange={(e) => setOutletQuery(e.target.value)}
                  className="h-9 w-full sm:w-56"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={exportOutletCsv}
                  disabled={loading || !data || data.outletActivity.length === 0}
                >
                  <Download className="h-4 w-4" />
                  CSV
                </Button>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : !data || data.outletActivity.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No completed visits in range.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead className="text-right">Visits</TableHead>
                    <TableHead className="text-right">Reps</TableHead>
                    <TableHead className="text-right">Last</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outletFiltered.map((o) => (
                    <TableRow key={o.outlet}>
                      <TableCell className="font-medium">
                        <div className="min-w-0">
                          <p className="truncate">{o.outlet}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Sell-in {formatGhs(o.sellInGhs)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{o.visits}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.reps}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {format(new Date(o.lastVisitedAt), 'd MMM')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loading && data && data.outletActivity.length > 0 && outletFiltered.length === 0 ? (
              <p className="px-6 py-4 text-center text-sm text-muted-foreground">
                No outlets match your search.
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  )
}

