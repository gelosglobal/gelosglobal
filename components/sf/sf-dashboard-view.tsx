'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow, startOfDay, startOfMonth } from 'date-fns'
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  Footprints,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
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

function severityBadge(s: 'high' | 'medium') {
  if (s === 'high') {
    return <Badge variant="destructive">High</Badge>
  }
  return <Badge variant="secondary">Medium</Badge>
}

export function SfDashboardView() {
  const [data, setData] = useState<SfDashboardPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    monthlyTargetGhs: '',
    primaryRegionLabel: '',
  })

  type RangePreset = '24h' | '7d' | '30d' | 'today' | 'mtd' | 'custom'
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

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = window.setInterval(() => {
      void load()
    }, 30_000)
    return () => window.clearInterval(t)
  }, [load])

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
        value: String(kpis.activeOutlets),
        subtitle: 'Registered active · or visited (30d) if none registered',
        icon: Building2,
        accent: 'border-l-blue-600',
      },
      {
        label: 'Visits',
        value: String(kpis.visits),
        subtitle: 'Completed shop visits',
        icon: Footprints,
        accent: 'border-l-emerald-600',
      },
      {
        label: 'B2B sell-in',
        value: formatGhs(kpis.b2bSellInGhs),
        subtitle: 'B2B Payments (invoiced net) · selected range',
        icon: TrendingUp,
        accent: 'border-l-violet-600',
      },
      {
        label: 'Collections',
        value: formatGhs(kpis.collectionsGhs),
        subtitle: 'Paid from B2B Payments · selected range',
        icon: Wallet,
        accent: 'border-l-amber-600',
      },
      {
        label: 'Target MTD',
        value:
          kpis.targetAttainmentPct != null
            ? `${kpis.targetAttainmentPct}%`
            : '—',
        subtitle: targetLabel,
        icon: Target,
        accent: 'border-l-indigo-600',
      },
      {
        label: 'Open POSM tasks',
        value: String(kpis.openPosmTasks),
        subtitle: 'Installs & audits',
        icon: Package,
        accent: 'border-l-orange-600',
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
          <div className="flex flex-wrap gap-2">
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
              <SelectTrigger className="h-9 w-[170px]">
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
              onClick={openSettings}
              disabled={!data}
            >
              Region &amp; target
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{today}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {rangeLabel ? <span>{rangeLabel}</span> : null}
            {data?.primaryRegionLabel ? (
              <span className="flex items-center gap-2">
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

        {loading && !data ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {kpiCards.map((k) => {
                const Icon = k.icon
                return (
                  <Card
                    key={k.label}
                    className={`border-b-0 border-r-0 border-t-0 border-l-4 p-5 ${k.accent}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {k.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                          {k.value}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{k.subtitle}</p>
                      </div>
                      <div className="rounded-lg bg-muted/80 p-2 text-muted-foreground">
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>

            {data.kpis.monthlyTargetGhs > 0 ? (
              <p className="text-xs text-muted-foreground">
                MTD mix: sell-in {formatGhs(data.kpis.mtdSellInGhs)} · collections{' '}
                {formatGhs(data.kpis.mtdCollectionsGhs)} · target {formatGhs(data.kpis.monthlyTargetGhs)}
              </p>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-0">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
                  <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">
                    Upcoming visits
                  </h2>
                </div>
                {data.upcomingVisits.length === 0 ? (
                  <Empty className="border-0 py-12">
                    <EmptyHeader>
                      <EmptyTitle>No scheduled visits</EmptyTitle>
                      <EmptyDescription>
                        Add visits with status &quot;scheduled&quot; and a future time in{' '}
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">sf_visits</code> to
                        see them here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
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
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {format(new Date(v.scheduledAt), 'd MMM · HH:mm')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              <Card className="p-0">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3 sm:px-6">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide">
                    Rep pulse (range)
                  </h2>
                </div>
                {data.repPulse.length === 0 ? (
                  <Empty className="border-0 py-12">
                    <EmptyHeader>
                      <EmptyTitle>No rep activity</EmptyTitle>
                      <EmptyDescription>
                        Page activity in the selected range will roll up here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rep</TableHead>
                        <TableHead className="hidden md:table-cell">Last page</TableHead>
                        <TableHead className="hidden lg:table-cell text-right">Last seen</TableHead>
                        <TableHead className="text-right">Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.repPulse.map((r) => (
                        <TableRow key={r.rep}>
                          <TableCell className="font-medium">{r.rep}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {r.lastPageTitle ?? '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-right text-sm text-muted-foreground">
                            {r.lastSeenAt
                              ? formatDistanceToNow(new Date(r.lastSeenAt), { addSuffix: true })
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {r.activityCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Alerts</h2>
              </div>
              {data.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No stock, POSM, or receivable alerts right now.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.alerts.map((a) => (
                    <Card
                      key={a.id}
                      className="flex flex-col gap-2 border-l-4 border-l-amber-600 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-sm text-foreground">{a.text}</p>
                      {severityBadge(a.severity)}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No data.</p>
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
