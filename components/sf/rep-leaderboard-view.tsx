'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Crown, Download, Loader2, RefreshCw, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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

type Metric = 'sellIn' | 'visits' | 'outlets'

type Snapshot = {
  generatedAt: string
  range: { from: string; to: string }
  metric: Metric
  items: Array<{
    rep: string
    visits: number
    outletsVisited: number
    sellInGhs: number
    lastVisitedAt: string | null
  }>
}

function dateToInput(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function metricLabel(m: Metric) {
  switch (m) {
    case 'visits':
      return 'Visits'
    case 'outlets':
      return 'Outlets covered'
    default:
      return 'Sell-in'
  }
}

export function RepLeaderboardView() {
  const defaultTo = useMemo(() => new Date(), [])
  const defaultFrom = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 29)
    return d
  }, [])

  const [from, setFrom] = useState(() => dateToInput(defaultFrom))
  const [to, setTo] = useState(() => dateToInput(defaultTo))
  const [metric, setMetric] = useState<Metric>('sellIn')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Snapshot | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (from.trim()) qs.set('from', from.trim())
      if (to.trim()) qs.set('to', to.trim())
      qs.set('metric', metric)
      const res = await fetch(`/api/sf/leaderboard?${qs.toString()}`, {
        credentials: 'include',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      setData((await res.json()) as Snapshot)
    } catch {
      toast.error('Could not load rep leaderboard')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, metric])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!data) return []
    if (!q) return data.items
    return data.items.filter((r) => r.rep.toLowerCase().includes(q))
  }, [data, query])

  const top3 = useMemo(() => (data?.items ?? []).slice(0, 3), [data])

  function exportCsv() {
    if (!data || data.items.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = ['rank', 'rep', 'visits', 'outletsVisited', 'sellInGhs', 'lastVisitedAt']
    const lines = [
      header.join(','),
      ...data.items.map((r, i) =>
        [
          i + 1,
          csvEscape(r.rep),
          r.visits,
          r.outletsVisited,
          r.sellInGhs,
          r.lastVisitedAt ?? '',
        ].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sf-rep-leaderboard-${metric}-${from}-to-${to}.csv`
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
        title="Rep Leaderboard"
        description="Rank reps by sell-in, visits, or outlet coverage over a date range. Uses completed shop visits (sf_visits)."
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={exportCsv}
              disabled={loading || !data || data.items.length === 0}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-sm text-muted-foreground">{updatedLabel}</div>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-2">
              <Label htmlFor="sf-lb-from" className="text-muted-foreground">
                From
              </Label>
              <Input
                id="sf-lb-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf-lb-to" className="text-muted-foreground">
                To
              </Label>
              <Input
                id="sf-lb-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="min-w-[180px] space-y-2">
              <Label className="text-muted-foreground">Rank by</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sellIn">Sell-in</SelectItem>
                  <SelectItem value="visits">Visits</SelectItem>
                  <SelectItem value="outlets">Outlets covered</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {top3.map((r, idx) => {
            const rank = idx + 1
            const accent =
              rank === 1
                ? 'border-l-amber-600'
                : rank === 2
                  ? 'border-l-slate-400'
                  : 'border-l-orange-600'
            return (
              <Card
                key={r.rep}
                className={`border-l-4 ${accent} border-r-0 border-t-0 border-b-0 p-5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Rank #{rank}
                    </p>
                    <p className="mt-2 truncate text-xl font-bold text-foreground">{r.rep}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {metricLabel(metric)} lead · Visits {r.visits} · Outlets {r.outletsVisited}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/80 p-2 text-muted-foreground">
                    {rank === 1 ? (
                      <Crown className="h-5 w-5" />
                    ) : (
                      <Trophy className="h-5 w-5" />
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="secondary">{formatGhs(r.sellInGhs)} sell-in</Badge>
                  {r.lastVisitedAt ? (
                    <Badge variant="outline">
                      Last visit {format(new Date(r.lastVisitedAt), 'd MMM')}
                    </Badge>
                  ) : null}
                </div>
              </Card>
            )
          })}
          {!loading && (!data || data.items.length === 0) ? (
            <Card className="p-6 text-sm text-muted-foreground sm:col-span-3">
              No completed visits found for this range.
            </Card>
          ) : null}
          {loading ? (
            <Card className="flex items-center justify-center p-10 text-muted-foreground sm:col-span-3">
              <Loader2 className="h-8 w-8 animate-spin" />
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-md">
            <Label htmlFor="sf-lb-search" className="text-muted-foreground">
              Search
            </Label>
            <Input
              id="sf-lb-search"
              placeholder="Rep name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Metric: <span className="font-medium text-foreground">{metricLabel(metric)}</span>
          </div>
        </div>

        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Leaderboard</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No rows.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[72px]">Rank</TableHead>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Sell-in</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Outlets</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Last visit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, idx) => (
                  <TableRow key={r.rep}>
                    <TableCell className="font-mono text-xs">
                      {idx === 0 ? (
                        <Badge className="bg-amber-600 hover:bg-amber-600">#1</Badge>
                      ) : (
                        `#${idx + 1}`
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{r.rep}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatGhs(r.sellInGhs)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.outletsVisited}</TableCell>
                    <TableCell className="hidden text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                      {r.lastVisitedAt ? format(new Date(r.lastVisitedAt), 'd MMM yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!loading && data && data.items.length > 0 && filtered.length === 0 ? (
            <p className="px-6 py-4 text-center text-sm text-muted-foreground">
              No reps match your search.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  )
}

