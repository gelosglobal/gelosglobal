'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, formatDistanceToNow, startOfDay, startOfMonth } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleDot,
  Footprints,
  LayoutGrid,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { SfPageHeader } from '@/components/sf/sf-page-header'
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
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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

const QUICK_LINKS = [
  { href: '/sf/shop-visits', label: 'Shop visits', icon: Footprints },
  { href: '/sf/posm-tracker', label: 'POSM tracker', icon: Package },
  { href: '/sf/inventory', label: 'Retail inventory', icon: Package },
  { href: '/sf/b2b-payments', label: 'B2B payments', icon: Wallet },
  { href: '/sf/customer-intelligence', label: 'Customer intelligence', icon: Building2 },
] as const

type SfDashboardPayload = {
  generatedAt: string
  rangeStart: string
  rangeEnd: string
  primaryRegionLabel: string
  kpis: {
    activeOutlets: number
    visits: number
    b2bSellInGhs: number
    collectionsGhs: number
    targetAttainmentPct: number | null
    monthlyTargetGhs: number
    mtdSellInGhs: number
    mtdCollectionsGhs: number
    openPosmTasks: number
  }
  upcomingVisits: Array<{
    id: string
    outlet: string
    rep: string
    scheduledAt: string
  }>
  repPulse: Array<{
    rep: string
    visits: number
    sellInGhs: number
    activityCount: number
    lastSeenAt: string | null
    lastPageTitle: string | null
  }>
  alerts: Array<{ id: string; severity: 'high' | 'medium'; text: string }>
}

type RepTaskRow = {
  id: string
  repName: string
  title: string
  dueAt: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'started' | 'in_progress' | 'done'
  notes: string | null
  createdAt: string
  updatedAt: string
}

function severityBadge(s: 'high' | 'medium') {
  if (s === 'high') {
    return <Badge variant="destructive">High</Badge>
  }
  return <Badge variant="secondary">Medium</Badge>
}

function SfDashboardKpiCard({
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

function rangePresetLabel(preset: RangePreset): string {
  switch (preset) {
    case '24h':
      return 'Last 24 hours'
    case '7d':
      return 'Last 7 days'
    case '30d':
      return 'Last 30 days'
    case 'today':
      return 'Today'
    case 'mtd':
      return 'This month'
    case 'custom':
      return 'Custom range'
    default:
      return 'Selected range'
  }
}

type RangePreset = '24h' | '7d' | '30d' | 'today' | 'mtd' | 'custom'

export function SfDashboardView() {
  const [data, setData] = useState<SfDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [tasksLoading, setTasksLoading] = useState(true)
  const [tasks, setTasks] = useState<RepTaskRow[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    monthlyTargetGhs: '',
    primaryRegionLabel: '',
  })

  const [rangePreset, setRangePreset] = useState<RangePreset>('7d')
  const [customOpen, setCustomOpen] = useState(false)

  const [rangeStart, setRangeStart] = useState<string>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    return start.toISOString().slice(0, 16)
  })
  const [rangeEnd, setRangeEnd] = useState<string>(() => new Date().toISOString().slice(0, 16))
  const [customDraft, setCustomDraft] = useState(() => ({
    start: rangeStart,
    end: rangeEnd,
  }))

  function toIso(value: string): string | undefined {
    const v = value.trim()
    if (!v) return undefined
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }

  function applyPreset(preset: Exclude<RangePreset, 'custom'>) {
    const end = new Date()
    let start: Date
    if (preset === '24h') start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    else if (preset === '7d') start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    else if (preset === '30d') start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    else if (preset === 'today') start = startOfDay(end)
    else start = startOfMonth(end)
    setRangeStart(start.toISOString().slice(0, 16))
    setRangeEnd(end.toISOString().slice(0, 16))
    setCustomDraft({ start: start.toISOString().slice(0, 16), end: end.toISOString().slice(0, 16) })
  }

  function openCustom() {
    setCustomDraft({ start: rangeStart, end: rangeEnd })
    setCustomOpen(true)
  }

  function saveCustom() {
    const s = toIso(customDraft.start)
    const e = toIso(customDraft.end)
    if (!s || !e) {
      toast.error('Pick a valid start and end date/time')
      return
    }
    if (new Date(s).getTime() > new Date(e).getTime()) {
      toast.error('Start must be before end')
      return
    }
    setRangeStart(customDraft.start)
    setRangeEnd(customDraft.end)
    setCustomOpen(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      const startIso = toIso(rangeStart)
      const endIso = toIso(rangeEnd)
      if (startIso) qs.set('start', startIso)
      if (endIso) qs.set('end', endIso)
      const url = `/api/sf/dashboard${qs.toString() ? `?${qs.toString()}` : ''}`

      const res = await fetch(url, { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      setData((await res.json()) as SfDashboardPayload)
    } catch {
      toast.error('Could not load SF dashboard')
    } finally {
      setLoading(false)
    }
  }, [rangeEnd, rangeStart])

  const loadTasks = useCallback(async () => {
    setTasksLoading(true)
    try {
      const res = await fetch('/api/rep/tasks', { credentials: 'include' })
      if (res.status === 401) return
      if (!res.ok) throw new Error('Failed')
      const json = (await res.json()) as { tasks: RepTaskRow[] }
      setTasks(Array.isArray(json.tasks) ? json.tasks : [])
    } catch {
      // stay silent; tasks are optional
      setTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    const t = window.setInterval(() => {
      void load()
    }, 30_000)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = window.setInterval(() => {
      void loadTasks()
    }, 30_000)
    return () => window.clearInterval(t)
  }, [loadTasks])

  async function updateTaskStatus(t: RepTaskRow, status: RepTaskRow['status']) {
    const prev = t.status
    setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, status } : x)))
    try {
      const res = await fetch(`/api/rep/tasks/${t.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      toast.error('Could not update task')
      setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, status: prev } : x)))
    }
  }

  function openSettings() {
    if (data) {
      setSettingsForm({
        monthlyTargetGhs: String(data.kpis.monthlyTargetGhs),
        primaryRegionLabel: data.primaryRegionLabel,
      })
    }
    setSettingsOpen(true)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    const monthlyTargetGhs = Number(settingsForm.monthlyTargetGhs)
    if (!Number.isFinite(monthlyTargetGhs) || monthlyTargetGhs < 0) {
      toast.error('Invalid monthly target')
      return
    }
    setSettingsSaving(true)
    try {
      const res = await fetch('/api/sf/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyTargetGhs,
          primaryRegionLabel: settingsForm.primaryRegionLabel.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Save failed')
      toast.success('SF settings saved')
      setSettingsOpen(false)
      void load()
    } catch {
      toast.error('Could not save settings')
    } finally {
      setSettingsSaving(false)
    }
  }

  const kpiCards = useMemo(() => {
    if (!data) return []
    const { kpis } = data
    const targetLabel =
      kpis.targetAttainmentPct != null
        ? `${kpis.targetAttainmentPct}% of ${formatGhs(kpis.monthlyTargetGhs)} MTD`
        : 'Add a monthly target to track quota'
    return [
      {
        label: 'Active outlets',
        value: kpis.activeOutlets.toLocaleString(),
        subtitle: 'Registered active · or visited (30d) if none registered',
        icon: Building2,
        iconWrapClass: 'bg-blue-500/10',
        iconClass: 'text-blue-600 dark:text-blue-400',
      },
      {
        label: 'Visits',
        value: kpis.visits.toLocaleString(),
        subtitle: 'Completed shop visits in range',
        icon: Footprints,
        iconWrapClass: 'bg-emerald-500/10',
        iconClass: 'text-emerald-600 dark:text-emerald-400',
      },
      {
        label: 'B2B sell-in',
        value: formatGhs(kpis.b2bSellInGhs),
        subtitle: 'B2B Payments (invoiced net) · selected range',
        icon: TrendingUp,
        iconWrapClass: 'bg-violet-500/10',
        iconClass: 'text-violet-600 dark:text-violet-400',
      },
      {
        label: 'Collections',
        value: formatGhs(kpis.collectionsGhs),
        subtitle: 'Paid from B2B Payments · selected range',
        icon: Wallet,
        iconWrapClass: 'bg-amber-500/10',
        iconClass: 'text-amber-600 dark:text-amber-400',
      },
      {
        label: 'Target MTD',
        value: kpis.targetAttainmentPct != null ? `${kpis.targetAttainmentPct}%` : '—',
        subtitle: targetLabel,
        icon: Target,
        iconWrapClass: 'bg-indigo-500/10',
        iconClass: 'text-indigo-600 dark:text-indigo-400',
      },
      {
        label: 'Open POSM tasks',
        value: kpis.openPosmTasks.toLocaleString(),
        subtitle: 'Installs & audits needing follow-up',
        icon: Package,
        iconWrapClass: 'bg-orange-500/10',
        iconClass: 'text-orange-600 dark:text-orange-400',
      },
    ]
  }, [data])

  const today = format(new Date(), 'EEEE, d MMM yyyy')
  const rangeLabel = useMemo(() => {
    if (!data) return null
    const start = new Date(data.rangeStart)
    const end = new Date(data.rangeEnd)
    return `${format(start, 'd MMM · HH:mm')} → ${format(end, 'd MMM · HH:mm')}`
  }, [data])

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="Retail Dashboard"
        description="Live roll-up from outlets, field visits, POSM tasks, DTC B2B portal orders, logged collections, finance receivables, and inventory health."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {loading && data ? (
              <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating
              </Badge>
            ) : null}
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
              onClick={openSettings}
              disabled={!data}
            >
              Region &amp; target
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Date range</h2>
            </div>
            <p className="text-sm text-muted-foreground">{today}</p>
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full sm:w-[200px]">
              <Label className="text-muted-foreground">Preset</Label>
              <Select
                value={rangePreset}
                onValueChange={(v) => {
                  const p = v as RangePreset
                  setRangePreset(p)
                  if (p === 'custom') {
                    openCustom()
                  } else {
                    applyPreset(p)
                  }
                }}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder="Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="mtd">This month</SelectItem>
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{rangePresetLabel(rangePreset)}</span>
              {rangeLabel ? <span>{rangeLabel}</span> : null}
              {data?.primaryRegionLabel ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {data.primaryRegionLabel}
                </span>
              ) : null}
              {data?.generatedAt ? (
                <span>
                  Updated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        {loading && !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">Loading live metrics…</p>
          </div>
        ) : data ? (
          <>
            <Card className="dashboard-card p-4 sm:p-5">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
                  <LayoutGrid className="h-3.5 w-3.5" />
                </span>
                Jump to
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
                  <Button key={href} variant="outline" size="sm" className="gap-1.5" asChild>
                    <Link href={href}>
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Link>
                  </Button>
                ))}
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {kpiCards.map((k) => (
                <SfDashboardKpiCard
                  key={k.label}
                  label={k.label}
                  value={loading ? '—' : k.value}
                  subtitle={k.subtitle}
                  icon={k.icon}
                  iconWrapClass={k.iconWrapClass}
                  iconClass={k.iconClass}
                />
              ))}
            </div>

            {data.kpis.monthlyTargetGhs > 0 ? (
              <Card className="dashboard-card p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">MTD target attainment</p>
                    <p className="text-xs text-muted-foreground">
                      Sell-in {formatGhs(data.kpis.mtdSellInGhs)} · collections{' '}
                      {formatGhs(data.kpis.mtdCollectionsGhs)} · target{' '}
                      {formatGhs(data.kpis.monthlyTargetGhs)}
                    </p>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-foreground">
                    {data.kpis.targetAttainmentPct != null
                      ? `${data.kpis.targetAttainmentPct}%`
                      : '—'}
                  </p>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{
                      width:
                        data.kpis.targetAttainmentPct != null
                          ? `${Math.min(100, data.kpis.targetAttainmentPct)}%`
                          : '0%',
                    }}
                  />
                </div>
              </Card>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="dashboard-card overflow-hidden p-0">
                <div className="border-b border-border/60 px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Upcoming visits</h2>
                    <Badge variant="secondary" className="tabular-nums">
                      {data.upcomingVisits.length.toLocaleString()}
                    </Badge>
                  </div>
                </div>
                {data.upcomingVisits.length === 0 ? (
                  <div className="p-6">
                    <Empty className="border-0 p-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <CalendarCheck className="h-6 w-6" />
                        </EmptyMedia>
                        <EmptyTitle>No scheduled visits</EmptyTitle>
                        <EmptyDescription>
                          Schedule shop visits with a future date to see them here.
                        </EmptyDescription>
                      </EmptyHeader>
                      <Button asChild size="sm" className="mt-4" variant="outline">
                        <Link href="/sf/shop-visits">Open shop visits</Link>
                      </Button>
                    </Empty>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead>Outlet</TableHead>
                          <TableHead className="hidden sm:table-cell">Rep</TableHead>
                          <TableHead className="text-right">When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.upcomingVisits.map((v) => (
                          <TableRow key={v.id}>
                            <TableCell className="font-medium">{v.outlet}</TableCell>
                            <TableCell className="hidden text-muted-foreground sm:table-cell">
                              {v.rep}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                              {format(new Date(v.scheduledAt), 'd MMM · HH:mm')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>

              <Card className="dashboard-card overflow-hidden p-0">
                <div className="border-b border-border/60 px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Rep pulse</h2>
                    <Badge variant="secondary" className="tabular-nums">
                      {data.repPulse.length.toLocaleString()}
                    </Badge>
                  </div>
                </div>
                {data.repPulse.length === 0 ? (
                  <div className="p-6">
                    <Empty className="border-0 p-0">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Footprints className="h-6 w-6" />
                        </EmptyMedia>
                        <EmptyTitle>No rep activity</EmptyTitle>
                        <EmptyDescription>
                          Page activity in the selected range will roll up here.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead>Rep</TableHead>
                          <TableHead className="hidden text-right md:table-cell">Visits</TableHead>
                          <TableHead className="hidden text-right lg:table-cell">Sell-in</TableHead>
                          <TableHead className="hidden md:table-cell">Last page</TableHead>
                          <TableHead className="hidden text-right lg:table-cell">Last seen</TableHead>
                          <TableHead className="text-right">Activity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.repPulse.map((r) => (
                          <TableRow key={r.rep}>
                            <TableCell className="font-medium">{r.rep}</TableCell>
                            <TableCell className="hidden text-right tabular-nums md:table-cell">
                              {r.visits.toLocaleString()}
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums lg:table-cell">
                              {formatGhs(r.sellInGhs)}
                            </TableCell>
                            <TableCell className="hidden max-w-[10rem] truncate text-muted-foreground md:table-cell">
                              {r.lastPageTitle ?? '—'}
                            </TableCell>
                            <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">
                              {r.lastSeenAt
                                ? formatDistanceToNow(new Date(r.lastSeenAt), { addSuffix: true })
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {r.activityCount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            </div>

            <Card className="dashboard-card overflow-hidden p-0">
              <div className="border-b border-border/60 px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
                  <Badge variant="secondary" className="tabular-nums">
                    {data.alerts.length.toLocaleString()}
                  </Badge>
                </div>
              </div>
              {data.alerts.length === 0 ? (
                <div className="p-6">
                  <Empty className="border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                      </EmptyMedia>
                      <EmptyTitle>All clear</EmptyTitle>
                      <EmptyDescription>
                        No stock, POSM, or receivable alerts right now.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <div className="space-y-2 p-4 sm:p-5">
                  {data.alerts.map((a) => (
                    <Card
                      key={a.id}
                      className={cn(
                        'dashboard-card flex flex-col gap-2 border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between',
                        a.severity === 'high' ? 'border-l-red-500' : 'border-l-amber-500',
                      )}
                    >
                      <p className="text-sm text-foreground">{a.text}</p>
                      {severityBadge(a.severity)}
                    </Card>
                  ))}
                </div>
              )}
            </Card>

            <Card className="dashboard-card overflow-hidden p-0">
              <div className="border-b border-border/60 px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-sm font-semibold text-foreground">My tasks</h2>
                  {!tasksLoading ? (
                    <Badge variant="secondary" className="tabular-nums">
                      {tasks.length.toLocaleString()}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {tasksLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading tasks…
                </div>
              ) : tasks.length === 0 ? (
                <div className="p-6">
                  <Empty className="border-0 p-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CheckCircle2 className="h-6 w-6" />
                      </EmptyMedia>
                      <EmptyTitle>No tasks assigned</EmptyTitle>
                      <EmptyDescription>
                        Tasks assigned to you will appear here for quick status updates.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </div>
              ) : (
                <div className="space-y-2 p-4 sm:p-5">
                  {tasks.slice(0, 12).map((t) => (
                    <Card
                      key={t.id}
                      className="dashboard-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.dueAt ? `Due ${format(new Date(t.dueAt), 'd MMM yyyy')}` : 'No due date'}
                          {t.priority ? ` · ${t.priority}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            t.priority === 'high'
                              ? 'destructive'
                              : t.priority === 'medium'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {t.priority}
                        </Badge>
                        <Select
                          value={t.status}
                          onValueChange={(v) => void updateTaskStatus(t, v as RepTaskRow['status'])}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue placeholder="Status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="started">
                              <span className="flex items-center gap-2">
                                <CircleDot className="h-4 w-4 text-slate-500" />
                                Started
                              </span>
                            </SelectItem>
                            <SelectItem value="in_progress">
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 text-amber-600" />
                                In progress
                              </span>
                            </SelectItem>
                            <SelectItem value="done">
                              <span className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                Done
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : (
          <div className="p-6">
            <Empty className="border-0 p-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <AlertTriangle className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No dashboard data</EmptyTitle>
                <EmptyDescription>
                  Try refreshing. If it persists, check your connection or date range.
                </EmptyDescription>
              </EmptyHeader>
              <Button
                type="button"
                size="sm"
                className="mt-4"
                variant="outline"
                onClick={() => void load()}
              >
                Refresh
              </Button>
            </Empty>
          </div>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveSettings}>
            <DialogHeader>
              <DialogTitle>Region &amp; monthly target</DialogTitle>
              <DialogDescription>
                Used for the header label and MTD attainment vs B2B sell-in + logged collections.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="sf-region">Primary region label</Label>
                <Input
                  id="sf-region"
                  value={settingsForm.primaryRegionLabel}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, primaryRegionLabel: e.target.value }))
                  }
                  placeholder="Greater Accra"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sf-target">Monthly target (GHS)</Label>
                <Input
                  id="sf-target"
                  inputMode="decimal"
                  value={settingsForm.monthlyTargetGhs}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, monthlyTargetGhs: e.target.value }))
                  }
                  placeholder="80000"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={settingsSaving}>
                {settingsSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom range</DialogTitle>
            <DialogDescription>Pick a start and end date/time.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sf-custom-start">From</Label>
              <Input
                id="sf-custom-start"
                type="datetime-local"
                value={customDraft.start}
                onChange={(e) => setCustomDraft((d) => ({ ...d, start: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf-custom-end">To</Label>
              <Input
                id="sf-custom-end"
                type="datetime-local"
                value={customDraft.end}
                onChange={(e) => setCustomDraft((d) => ({ ...d, end: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCustomOpen(false)
                if (rangePreset === 'custom') setRangePreset('7d')
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveCustom}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
