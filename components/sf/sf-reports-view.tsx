'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  endOfMonth,
  format,
  min,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Download,
  Footprints,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  Target,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatGhs } from '@/lib/dtc-orders'
import { cn } from '@/lib/utils'

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

const QUICK_LINKS = [
  { href: '/sf/dashboard', label: 'Retail dashboard', icon: BarChart3 },
  { href: '/sf/leaderboard', label: 'Rep leaderboard', icon: Target },
  { href: '/sf/shop-visits', label: 'Shop visits', icon: Footprints },
] as const

function dateToInput(d: Date): string {
  return format(startOfDay(d), 'yyyy-MM-dd')
}

function parseLocalDateOnly(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function ReportsKpiCard({
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

function RelativeBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <Progress value={pct} className="h-1.5 flex-1" />
      <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  )
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
    if (from.trim() && to.trim() && from > to) {
      toast.error('From date must be on or before To date')
      return
    }
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

  const topRep = data?.repPerformance[0] ?? null
  const topOutlet = data?.outletActivity[0] ?? null
  const maxRepSellIn = topRep?.sellInGhs ?? 0
  const maxOutletVisits = topOutlet?.visits ?? 0

  const updatedLabel = useMemo(() => {
    if (!data) return null
    return `Updated ${format(new Date(data.generatedAt), 'd MMM · HH:mm')}`
  }, [data])

  const rangeSummary = useMemo(() => {
    if (!from.trim() || !to.trim()) return null
    try {
      return `${format(parseLocalDateOnly(from), 'd MMM yyyy')} – ${format(parseLocalDateOnly(to), 'd MMM yyyy')}`
    } catch {
      return null
    }
  }, [from, to])

  const coveragePct = data?.kpis.coveragePct ?? null

  function applyPreset(key: '7d' | '30d' | 'month' | 'lastMonth') {
    const now = new Date()
    const today = startOfDay(now)
    switch (key) {
      case '7d':
        setFrom(format(subDays(today, 6), 'yyyy-MM-dd'))
        setTo(format(today, 'yyyy-MM-dd'))
        break
      case '30d':
        setFrom(format(subDays(today, 29), 'yyyy-MM-dd'))
        setTo(format(today, 'yyyy-MM-dd'))
        break
      case 'month': {
        const start = startOfMonth(now)
        const endCap = min([today, endOfMonth(now)])
        setFrom(format(start, 'yyyy-MM-dd'))
        setTo(format(endCap, 'yyyy-MM-dd'))
        break
      }
      case 'lastMonth': {
        const ref = subMonths(now, 1)
        setFrom(format(startOfMonth(ref), 'yyyy-MM-dd'))
        setTo(format(endOfMonth(ref), 'yyyy-MM-dd'))
        break
      }
      default:
        break
    }
  }

  function exportRepCsv() {
    if (!data || data.repPerformance.length === 0) {
      toast.message('Nothing to export')
      return
    }
    const header = ['rep', 'visits', 'outletsVisited', 'sellInGhs']
    const lines = [
      header.join(','),
      ...data.repPerformance.map((r) =>
        [csvEscape(r.rep), r.visits, r.outletsVisited, r.sellInGhs].join(','),
      ),
    ]
    downloadCsv(lines, `sf-rep-performance-${from}-to-${to}.csv`)
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
        [csvEscape(o.outlet), o.visits, o.reps, o.sellInGhs, o.lastVisitedAt].join(','),
      ),
    ]
    downloadCsv(lines, `sf-outlet-activity-${from}-to-${to}.csv`)
  }

  function downloadCsv(lines: string[], filename: string) {
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Retail Reports"
        description="Field activity reporting from completed shop visits — rep performance, outlet coverage, and sell-in roll-ups."
        actions={
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

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold text-foreground">Time range</p>
                <p className="text-xs text-muted-foreground">
                  {rangeSummary
                    ? `Completed visits from ${rangeSummary}`
                    : 'Pick a start and end date (inclusive)'}
                </p>
              </div>
            </div>
            {updatedLabel ? (
              <p className="text-xs text-muted-foreground">{updatedLabel}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['7d', 'Last 7 days'],
                ['30d', 'Last 30 days'],
                ['month', 'This month'],
                ['lastMonth', 'Last month'],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:max-w-md">
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
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ReportsKpiCard
            label="Completed visits"
            value={loading ? '—' : (data?.kpis.completedVisits ?? 0).toLocaleString()}
            subtitle="Shop visits marked complete"
            icon={Footprints}
            iconWrapClass="bg-indigo-500/10"
            iconClass="text-indigo-600 dark:text-indigo-400"
          />
          <ReportsKpiCard
            label="Sell-in"
            value={loading ? '—' : formatGhs(data?.kpis.sellInGhs ?? 0)}
            subtitle="Recorded on completed visits"
            icon={Wallet}
            iconWrapClass="bg-emerald-500/10"
            iconClass="text-emerald-600 dark:text-emerald-400"
          />
          <ReportsKpiCard
            label="Active reps"
            value={loading ? '—' : (data?.kpis.activeReps ?? 0).toLocaleString()}
            subtitle="Reps with completed visits"
            icon={Users}
            iconWrapClass="bg-primary/10"
            iconClass="text-primary"
          />
          <ReportsKpiCard
            label="Outlets visited"
            value={loading ? '—' : (data?.kpis.outletsVisited ?? 0).toLocaleString()}
            subtitle={
              loading
                ? 'Distinct outlets in range'
                : `${data?.kpis.activeOutlets ?? 0} active outlets in network`
            }
            icon={Store}
            iconWrapClass="bg-sky-500/10"
            iconClass="text-sky-600 dark:text-sky-400"
          />
        </div>

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Outlet coverage</p>
              <p className="text-xs text-muted-foreground">
                Outlets visited ÷ active outlets in the network
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {loading ? '—' : coveragePct == null ? '—' : `${coveragePct}%`}
              </p>
              {!loading && data ? (
                <Badge variant="outline" className="mt-1 tabular-nums">
                  {data.kpis.outletsVisited}/{data.kpis.activeOutlets} outlets
                </Badge>
              ) : null}
            </div>
          </div>
          <Progress
            value={coveragePct ?? 0}
            className={cn(
              'h-2.5',
              coveragePct != null && coveragePct >= 75 && '[&>div]:bg-emerald-500',
              coveragePct != null && coveragePct >= 50 && coveragePct < 75 && '[&>div]:bg-amber-500',
              coveragePct != null && coveragePct < 50 && '[&>div]:bg-red-500',
            )}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Top rep
              </p>
              <p className="mt-1 truncate font-semibold text-foreground">
                {loading || !topRep ? '—' : topRep.rep}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading || !topRep
                  ? 'By sell-in'
                  : `${formatGhs(topRep.sellInGhs)} · ${topRep.visits} visits`}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Top outlet
              </p>
              <p className="mt-1 truncate font-semibold text-foreground">
                {loading || !topOutlet ? '—' : topOutlet.outlet}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {loading || !topOutlet
                  ? 'By visits'
                  : `${topOutlet.visits} visits · ${formatGhs(topOutlet.sellInGhs)}`}
              </p>
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="dashboard-card overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Rep performance</h2>
                <p className="text-xs text-muted-foreground">Ranked by sell-in in range</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[10rem] flex-1 sm:w-48 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search rep…"
                    value={repQuery}
                    onChange={(e) => setRepQuery(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
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
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Loading reps…</span>
              </div>
            ) : !data || data.repPerformance.length === 0 ? (
              <Empty className="border-0 py-16">
                <EmptyHeader>
                  <EmptyTitle>No rep activity</EmptyTitle>
                  <EmptyDescription>
                    No completed visits in this range. Try widening the dates or log visits in Shop
                    Visits.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : repFiltered.length === 0 ? (
              <Empty className="border-0 py-12">
                <EmptyHeader>
                  <EmptyTitle>No matches</EmptyTitle>
                  <EmptyDescription>No reps match your search.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                    <TableRow>
                      <TableHead>Rep</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                      <TableHead className="text-right">Outlets</TableHead>
                      <TableHead className="text-right">Sell-in</TableHead>
                      <TableHead className="hidden min-w-[120px] sm:table-cell">vs top</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {repFiltered.map((r, idx) => (
                      <TableRow key={r.rep}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {idx < 3 ? (
                              <Badge
                                className={cn(
                                  'border-transparent text-white',
                                  idx === 0 && 'bg-amber-500 hover:bg-amber-500',
                                  idx === 1 && 'bg-slate-400 hover:bg-slate-400',
                                  idx === 2 && 'bg-orange-600 hover:bg-orange-600',
                                )}
                              >
                                #{idx + 1}
                              </Badge>
                            ) : null}
                            <span className="font-medium">{r.rep}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.visits.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.outletsVisited.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatGhs(r.sellInGhs)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <RelativeBar value={r.sellInGhs} max={maxRepSellIn} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!loading && data && data.repPerformance.length > 0 ? (
              <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground sm:px-5">
                {repFiltered.length} of {data.repPerformance.length} reps
              </p>
            ) : null}
          </Card>

          <Card className="dashboard-card overflow-hidden p-0">
            <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Outlet activity</h2>
                <p className="text-xs text-muted-foreground">Ranked by visit count in range</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[10rem] flex-1 sm:w-48 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search outlet…"
                    value={outletQuery}
                    onChange={(e) => setOutletQuery(e.target.value)}
                    className="h-9 pl-8"
                  />
                </div>
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
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Loading outlets…</span>
              </div>
            ) : !data || data.outletActivity.length === 0 ? (
              <Empty className="border-0 py-16">
                <EmptyHeader>
                  <EmptyTitle>No outlet activity</EmptyTitle>
                  <EmptyDescription>
                    No completed visits in this range. Try widening the dates.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : outletFiltered.length === 0 ? (
              <Empty className="border-0 py-12">
                <EmptyHeader>
                  <EmptyTitle>No matches</EmptyTitle>
                  <EmptyDescription>No outlets match your search.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="max-h-[28rem] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur-sm">
                    <TableRow>
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-right">Visits</TableHead>
                      <TableHead className="text-right">Reps</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Sell-in</TableHead>
                      <TableHead className="text-right">Last visit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outletFiltered.map((o) => (
                      <TableRow key={o.outlet}>
                        <TableCell className="min-w-[140px]">
                          <div className="flex items-start gap-2">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{o.outlet}</p>
                              <div className="mt-1 hidden sm:block">
                                <RelativeBar value={o.visits} max={maxOutletVisits} />
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{o.visits}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.reps}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">
                          {formatGhs(o.sellInGhs)}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                          {format(new Date(o.lastVisitedAt), 'd MMM')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!loading && data && data.outletActivity.length > 0 ? (
              <p className="border-t border-border/60 px-4 py-2 text-xs text-muted-foreground sm:px-5">
                {outletFiltered.length} of {data.outletActivity.length} outlets
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  )
}
