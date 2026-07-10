'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Crown,
  Download,
  Footprints,
  Loader2,
  Medal,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  Target,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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

const QUICK_LINKS = [
  { href: '/sf/shop-visits', label: 'Shop visits', icon: Footprints },
  { href: '/sf/targets', label: 'Targets & quotas', icon: Target },
] as const

const METRIC_OPTIONS: Array<{ value: Metric; label: string; icon: LucideIcon }> = [
  { value: 'sellIn', label: 'Sell-in', icon: Wallet },
  { value: 'visits', label: 'Visits', icon: Footprints },
  { value: 'outlets', label: 'Outlets covered', icon: Store },
]

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

function metricValue(row: Snapshot['items'][number], m: Metric): number {
  switch (m) {
    case 'visits':
      return row.visits
    case 'outlets':
      return row.outletsVisited
    default:
      return row.sellInGhs
  }
}

function formatMetricValue(value: number, m: Metric): string {
  if (m === 'sellIn') return formatGhs(value)
  return value.toLocaleString()
}

function LbKpiCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconWrapClass,
  iconClass,
}: {
  label: string
  value: React.ReactNode
  subtitle: React.ReactNode
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

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <Badge className="border-transparent bg-amber-500 text-white hover:bg-amber-500">#1</Badge>
    )
  }
  if (rank === 2) {
    return (
      <Badge className="border-transparent bg-slate-400 text-white hover:bg-slate-400">#2</Badge>
    )
  }
  if (rank === 3) {
    return (
      <Badge className="border-transparent bg-orange-600 text-white hover:bg-orange-600">#3</Badge>
    )
  }
  return <span className="font-mono text-xs text-muted-foreground">#{rank}</span>
}

function PodiumCard({
  rank,
  rep,
  metric,
  row,
}: {
  rank: 1 | 2 | 3
  rep: string
  metric: Metric
  row: Snapshot['items'][number]
}) {
  const styles =
    rank === 1
      ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-card'
      : rank === 2
        ? 'border-slate-400/30 bg-gradient-to-br from-slate-400/10 to-card'
        : 'border-orange-600/25 bg-gradient-to-br from-orange-600/10 to-card'

  const Icon = rank === 1 ? Crown : rank === 2 ? Medal : Trophy
  const iconClass =
    rank === 1
      ? 'text-amber-600 dark:text-amber-400'
      : rank === 2
        ? 'text-slate-500 dark:text-slate-400'
        : 'text-orange-600 dark:text-orange-400'

  return (
    <Card className={cn('dashboard-card border p-5', styles)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Rank #{rank}
          </p>
          <p className="mt-1 truncate text-lg font-bold text-foreground">{rep}</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {formatMetricValue(metricValue(row, metric), metric)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Leading {metricLabel(metric).toLowerCase()}
          </p>
        </div>
        <div className={cn('rounded-2xl bg-muted/50 p-3', iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{row.visits.toLocaleString()} visits</Badge>
        <Badge variant="outline">{row.outletsVisited.toLocaleString()} outlets</Badge>
        <Badge variant="outline">{formatGhs(row.sellInGhs)}</Badge>
      </div>
    </Card>
  )
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

  const rankByRep = useMemo(() => {
    const map = new Map<string, number>()
    data?.items.forEach((r, i) => map.set(r.rep, i + 1))
    return map
  }, [data])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!data) return []
    if (!q) return data.items
    return data.items.filter((r) => r.rep.toLowerCase().includes(q))
  }, [data, query])

  const top3 = useMemo(() => (data?.items ?? []).slice(0, 3), [data])

  const summary = useMemo(() => {
    const items = data?.items ?? []
    const leader = items[0] ?? null
    const maxMetric = leader ? metricValue(leader, metric) : 0
    return {
      reps: items.length,
      totalSellIn: items.reduce((s, r) => s + r.sellInGhs, 0),
      totalVisits: items.reduce((s, r) => s + r.visits, 0),
      leader,
      maxMetric,
    }
  }, [data, metric])

  const rangeLabel = useMemo(() => {
    if (!from || !to) return 'Selected range'
    try {
      return `${format(new Date(`${from}T12:00:00`), 'd MMM yyyy')} – ${format(new Date(`${to}T12:00:00`), 'd MMM yyyy')}`
    } catch {
      return 'Selected range'
    }
  }, [from, to])

  function applyPreset(days: number) {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - (days - 1))
    setFrom(dateToInput(start))
    setTo(dateToInput(end))
  }

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

  const hasActiveFilters = query.trim().length > 0

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Rep Leaderboard"
        description="Rank field reps by sell-in, visits, or outlet coverage. Based on completed shop visits in the selected date range."
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
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
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

      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <Button key={link.href} variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={link.href}>
                  <Icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              </Button>
            )
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LbKpiCard
            label="Active reps"
            value={loading ? '—' : summary.reps.toLocaleString()}
            subtitle={rangeLabel}
            icon={Users}
            iconWrapClass="bg-primary/10"
            iconClass="text-primary"
          />
          <LbKpiCard
            label="Total sell-in"
            value={loading ? '—' : formatGhs(summary.totalSellIn)}
            subtitle="Across all ranked reps"
            icon={Wallet}
            iconWrapClass="bg-emerald-500/10"
            iconClass="text-emerald-600 dark:text-emerald-400"
          />
          <LbKpiCard
            label="Total visits"
            value={loading ? '—' : summary.totalVisits.toLocaleString()}
            subtitle="Completed in range"
            icon={Footprints}
            iconWrapClass="bg-indigo-500/10"
            iconClass="text-indigo-600 dark:text-indigo-400"
          />
          <LbKpiCard
            label={`Top ${metricLabel(metric).toLowerCase()}`}
            value={
              loading || !summary.leader
                ? '—'
                : formatMetricValue(metricValue(summary.leader, metric), metric)
            }
            subtitle={summary.leader ? summary.leader.rep : 'No data yet'}
            icon={BarChart3}
            iconWrapClass="bg-amber-500/10"
            iconClass="text-amber-600 dark:text-amber-400"
          />
        </div>

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Rank by metric</p>
              <p className="text-xs text-muted-foreground">
                {updatedLabel ?? 'Choose how reps are ordered'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {METRIC_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const active = metric === opt.value
              return (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  className="gap-1.5"
                  onClick={() => setMetric(opt.value)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </Button>
              )
            })}
          </div>
        </Card>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="dashboard-card flex h-40 items-center justify-center p-5">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </Card>
            ))}
          </div>
        ) : top3.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {top3.map((r, idx) => (
              <PodiumCard
                key={r.rep}
                rank={(idx + 1) as 1 | 2 | 3}
                rep={r.rep}
                metric={metric}
                row={r}
              />
            ))}
          </div>
        ) : null}

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Date range & search</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset(7)}>
                7 days
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => applyPreset(30)}>
                30 days
              </Button>
              {hasActiveFilters ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[10rem_10rem_minmax(0,1fr)]">
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
              <Input id="sf-lb-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf-lb-search" className="text-muted-foreground">
                Search reps
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="sf-lb-search"
                  placeholder="Rep name…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          {!loading && data ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {filtered.length} of {data.items.length} rep
              {data.items.length === 1 ? '' : 's'} · ranked by {metricLabel(metric).toLowerCase()}
            </p>
          ) : null}
        </Card>

        <Card className="dashboard-card overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Full leaderboard</h2>
              <p className="text-xs text-muted-foreground">
                Relative bars compare each rep to the leader on {metricLabel(metric).toLowerCase()}
              </p>
            </div>
            {!loading && data && data.items.length > 0 ? (
              <Badge variant="outline" className="tabular-nums">
                {filtered.length} rows
              </Badge>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading leaderboard…</span>
            </div>
          ) : !data || data.items.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No completed visits</EmptyTitle>
                <EmptyDescription>
                  No completed shop visits were found for this date range. Try widening the range or
                  log visits in Shop Visits.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty className="border-0 py-16">
              <EmptyHeader>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>No reps match your search. Try another name.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="w-[72px]">Rank</TableHead>
                    <TableHead>Rep</TableHead>
                    <TableHead
                      className={cn(metric === 'sellIn' && 'bg-primary/5 font-semibold text-foreground')}
                    >
                      Sell-in
                    </TableHead>
                    <TableHead
                      className={cn(metric === 'visits' && 'bg-primary/5 font-semibold text-foreground')}
                    >
                      Visits
                    </TableHead>
                    <TableHead
                      className={cn(
                        metric === 'outlets' && 'bg-primary/5 font-semibold text-foreground',
                      )}
                    >
                      Outlets
                    </TableHead>
                    <TableHead className="hidden min-w-[140px] md:table-cell">vs leader</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Last visit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const rank = rankByRep.get(r.rep) ?? 0
                    const value = metricValue(r, metric)
                    const pct =
                      summary.maxMetric > 0
                        ? Math.min(100, Math.round((value / summary.maxMetric) * 100))
                        : 0
                    return (
                      <TableRow key={r.rep}>
                        <TableCell>
                          <RankBadge rank={rank} />
                        </TableCell>
                        <TableCell className="font-medium">{r.rep}</TableCell>
                        <TableCell
                          className={cn(
                            'tabular-nums',
                            metric === 'sellIn' && 'bg-primary/5 font-semibold',
                          )}
                        >
                          {formatGhs(r.sellInGhs)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'tabular-nums',
                            metric === 'visits' && 'bg-primary/5 font-semibold',
                          )}
                        >
                          {r.visits.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'tabular-nums',
                            metric === 'outlets' && 'bg-primary/5 font-semibold',
                          )}
                        >
                          {r.outletsVisited.toLocaleString()}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Progress value={pct} className="h-1.5 flex-1" />
                            <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                              {pct}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden text-right text-sm text-muted-foreground tabular-nums md:table-cell">
                          {r.lastVisitedAt
                            ? format(new Date(r.lastVisitedAt), 'd MMM yyyy')
                            : '—'}
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
