'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
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
  primaryRegionLabel: string
  kpis: {
    activeOutlets: number
    visits7d: number
    b2bSellIn7d: number
    collections7d: number
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
  repPulse: Array<{ rep: string; visits: number; sellInGhs: number }>
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sf/dashboard', { credentials: 'include' })
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
  }, [])

  useEffect(() => {
    void load()
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
        label: 'Visits (7d)',
        value: String(kpis.visits7d),
        subtitle: 'Completed shop visits',
        icon: Footprints,
        accent: 'border-l-emerald-600',
      },
      {
        label: 'B2B sell-in (7d)',
        value: formatGhs(kpis.b2bSellIn7d),
        subtitle: 'B2B portal orders (DTC engine)',
        icon: TrendingUp,
        accent: 'border-l-violet-600',
      },
      {
        label: 'Collections (7d)',
        value: formatGhs(kpis.collections7d),
        subtitle: 'Logged B2B cash collections',
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

  return (
    <div className="flex min-h-0 flex-col">
      <SfPageHeader
        title="SF Dashboard"
        description="Live roll-up from outlets, field visits, POSM tasks, DTC B2B portal orders, logged collections, finance receivables, and inventory health."
        actions={
          <div className="flex flex-wrap gap-2">
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
                    Rep pulse (7d)
                  </h2>
                </div>
                {data.repPulse.length === 0 ? (
                  <Empty className="border-0 py-12">
                    <EmptyHeader>
                      <EmptyTitle>No rep activity</EmptyTitle>
                      <EmptyDescription>
                        Completed visits in the last 7 days with a rep name will roll up here.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rep</TableHead>
                        <TableHead className="text-right">Visits</TableHead>
                        <TableHead className="text-right">Sell-in logged</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.repPulse.map((r) => (
                        <TableRow key={r.rep}>
                          <TableCell className="font-medium">{r.rep}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.visits}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatGhs(r.sellInGhs)}
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
    </div>
  )
}
