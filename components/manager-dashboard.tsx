'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { format, formatDistanceToNow, startOfDay, startOfMonth } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  CalendarClock,
  CreditCard,
  Footprints,
  Inbox,
  LayoutGrid,
  Loader2,
  Map,
  MapPin,
  Package,
  PieChart,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Store,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatGhs } from '@/lib/dtc-orders'

type RangePreset = '24h' | '7d' | '30d' | 'today' | 'mtd' | 'custom'

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
  repPulse: Array<{ rep: string; visits: number; sellInGhs: number }>
  alerts: Array<{ id: string; severity: 'high' | 'medium'; text: string }>
}

type FinancePayload = {
  periodDays: number
  periodStart?: string
  periodEnd?: string
  dtcRevenue: number
  b2bCollected: number
  b2bInvoiceRevenue?: number
  b2bInvoicePaidGhs?: number
  totalRevenue: number
  marketingSpendGhs: number
  netProfit: number
  b2bOutstandingGhs: number
}

type OrderRow = {
  id: string
  orderNumber: string
  customer: string
  channel: string
  totalAmount: number
  orderedAt: string
}

const QUICK_LINKS: { href: string; label: string; icon: typeof Package }[] = [
  { href: '/dtc/orders-engine', label: 'Orders Engine', icon: Package },
  { href: '/dtc/finance-layer', label: 'Finance Layer', icon: BarChart3 },
  { href: '/dtc/inventory', label: 'DTC Inventory', icon: Package },
  { href: '/sf/dashboard', label: 'SF Dashboard', icon: Target },
  { href: '/sf/shop-visits', label: 'Shop Visits', icon: Store },
  { href: '/sf/outlet-scouting', label: 'Outlet Scouting', icon: Map },
  { href: '/sf/outlet-scout-map', label: 'Scout Map', icon: MapPin },
  { href: '/sf/posm-tracker', label: 'POSM Tracker', icon: Target },
  { href: '/sf/inventory', label: 'Retail Inventory', icon: Package },
  { href: '/sf/b2b-payments', label: 'B2B Payments', icon: CreditCard },
  { href: '/sf/targets', label: 'Targets & Quotas', icon: Target },
  { href: '/sf/reports', label: 'SF Reports', icon: BarChart3 },
  { href: '/sf/leaderboard', label: 'Rep Leaderboard', icon: BarChart3 },
]

function alertBorderClass(sev: 'high' | 'medium') {
  return sev === 'high' ? 'border-l-red-600' : 'border-l-amber-600'
}

function MasterKpiCard({
  borderAccent,
  icon: Icon,
  iconWrapClass,
  iconClass,
  label,
  value,
  subtitle,
}: {
  borderAccent: string
  icon: LucideIcon
  iconWrapClass: string
  iconClass: string
  label: string
  value: ReactNode
  subtitle: ReactNode
}) {
  return (
    <Card
      className={`border-l-4 ${borderAccent} border-r-0 border-t-0 border-b-0 p-6`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`shrink-0 rounded-xl p-3 ${iconWrapClass}`}>
          <Icon className={`h-6 w-6 ${iconClass}`} />
        </div>
      </div>
    </Card>
  )
}

function SectionCardTitle({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      {children}
    </h3>
  )
}

export function ManagerDashboard() {
  const [loading, setLoading] = useState(true)
  const [sf, setSf] = useState<SfDashboardPayload | null>(null)
  const [finance, setFinance] = useState<FinancePayload | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])

  const [rangePreset, setRangePreset] = useState<RangePreset>('30d')
  const [customOpen, setCustomOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    return start.toISOString().slice(0, 16)
  })
  const [rangeEnd, setRangeEnd] = useState<string>(() => new Date().toISOString().slice(0, 16))
  const [customDraft, setCustomDraft] = useState(() => ({ start: rangeStart, end: rangeEnd }))

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
    const s = start.toISOString().slice(0, 16)
    const e = end.toISOString().slice(0, 16)
    setRangeStart(s)
    setRangeEnd(e)
    setCustomDraft({ start: s, end: e })
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
      const startIso = toIso(rangeStart)
      const endIso = toIso(rangeEnd)
      const sfQs = new URLSearchParams()
      const finQs = new URLSearchParams()
      if (startIso && endIso) {
        sfQs.set('start', startIso)
        sfQs.set('end', endIso)
        finQs.set('start', startIso)
        finQs.set('end', endIso)
      }

      const [sfRes, finRes, ordRes] = await Promise.all([
        fetch(`/api/sf/dashboard${sfQs.toString() ? `?${sfQs.toString()}` : ''}`, {
          credentials: 'include',
        }),
        fetch(`/api/dtc/finance-layer${finQs.toString() ? `?${finQs.toString()}` : ''}`, {
          credentials: 'include',
        }),
        fetch('/api/dtc/orders', { credentials: 'include' }),
      ])

      if (sfRes.status === 401 || finRes.status === 401 || ordRes.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }

      if (!sfRes.ok || !finRes.ok || !ordRes.ok) {
        throw new Error('One or more requests failed')
      }

      const sfJson = (await sfRes.json()) as SfDashboardPayload
      const finJson = (await finRes.json()) as FinancePayload
      const ordJson = (await ordRes.json()) as { orders: OrderRow[] }

      setSf(sfJson)
      setFinance(finJson)
      setOrders(ordJson.orders ?? [])
    } catch {
      toast.error('Could not load master dashboard data')
      setSf(null)
      setFinance(null)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [rangeEnd, rangeStart])

  useEffect(() => {
    void load()
  }, [load])

  const totalRev = finance?.totalRevenue ?? 0
  const dtcPct =
    totalRev > 0 && finance
      ? Math.min(100, Math.round((finance.dtcRevenue / totalRev) * 1000) / 10)
      : 0
  const b2bPct =
    totalRev > 0 && finance
      ? Math.min(100, Math.round((finance.b2bCollected / totalRev) * 1000) / 10)
      : 0

  const revenueBarData = [
    { channel: 'DTC', percentage: dtcPct, fill: '#7c3aed' },
    { channel: 'B2B collected', percentage: b2bPct, fill: '#2563eb' },
  ]

  const roasX =
    finance && finance.marketingSpendGhs > 0
      ? `${Math.min(999, Math.round((finance.totalRevenue / finance.marketingSpendGhs) * 10) / 10)}x`
      : '—'

  const recentOrders = orders.slice(0, 6)
  const upcoming = sf?.upcomingVisits.slice(0, 6) ?? []
  const alerts = sf?.alerts.slice(0, 10) ?? []

  const headerDate = format(new Date(), 'd MMM yyyy')
  const rangeLabel = (() => {
    const s = toIso(rangeStart)
    const e = toIso(rangeEnd)
    if (!s || !e) return null
    return `${format(new Date(s), 'd MMM · HH:mm')} → ${format(new Date(e), 'd MMM · HH:mm')}`
  })()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-4 py-4 sm:px-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Master Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live roll-up from Finance Layer, Sales Force, and DTC orders
          </p>
          {rangeLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">{rangeLabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <p className="hidden text-sm text-muted-foreground sm:block">{headerDate}</p>
          <Select
            value={rangePreset}
            onValueChange={(v) => {
              const p = v as RangePreset
              setRangePreset(p)
              if (p === 'custom') openCustom()
              else applyPreset(p)
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
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
        {loading && !sf && !finance ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">Loading live metrics…</p>
          </div>
        ) : null}

        <Card className="p-4">
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MasterKpiCard
            borderAccent="border-l-blue-600"
            icon={Wallet}
            iconWrapClass="bg-blue-600/10"
            iconClass="text-blue-600"
            label="Total revenue"
            value={finance ? formatGhs(finance.totalRevenue) : '—'}
            subtitle={
              finance
                ? `Last ${finance.periodDays} days · DTC + B2B collected = ${formatGhs(finance.totalRevenue)}`
                : `DTC + B2B collected`
            }
          />
          <MasterKpiCard
            borderAccent="border-l-purple-600"
            icon={ShoppingBag}
            iconWrapClass="bg-purple-600/10"
            iconClass="text-purple-600"
            label="DTC revenue"
            value={finance ? formatGhs(finance.dtcRevenue) : '—'}
            subtitle="Excludes B2B portal orders"
          />
          <MasterKpiCard
            borderAccent="border-l-green-600"
            icon={Banknote}
            iconWrapClass="bg-green-600/10"
            iconClass="text-green-600"
            label="B2B collected"
            value={finance ? formatGhs(finance.b2bInvoicePaidGhs ?? 0) : '—'}
            subtitle="Sum of paid across invoices"
          />
          <MasterKpiCard
            borderAccent="border-l-red-600"
            icon={CreditCard}
            iconWrapClass="bg-red-600/10"
            iconClass="text-red-600"
            label="B2B outstanding"
            value={finance ? formatGhs(finance.b2bOutstandingGhs) : '—'}
            subtitle="Manual AR · Finance Layer"
          />
          <MasterKpiCard
            borderAccent="border-l-indigo-600"
            icon={Footprints}
            iconWrapClass="bg-indigo-600/10"
            iconClass="text-indigo-600"
            label="SF field"
            value={sf ? sf.kpis.visits : '—'}
            subtitle={
              <>
                Visits · {sf ? formatGhs(sf.kpis.collectionsGhs) : '—'} paid ·{' '}
                {sf ? `${sf.kpis.openPosmTasks} open POSM` : '—'}
              </>
            }
          />
          <MasterKpiCard
            borderAccent="border-l-teal-600"
            icon={TrendingUp}
            iconWrapClass="bg-teal-600/10"
            iconClass="text-teal-600"
            label="Net profit · ROAS hint"
            value={finance ? formatGhs(finance.netProfit) : '—'}
            subtitle={
              <>
                Net (period) · Revenue ÷ mktg spend ≈ {roasX}
              </>
            }
          />
        </div>

        <Card className="p-6">
          <h3 className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </span>
            Revenue split — DTC vs B2B collected
          </h3>
          <ResponsiveContainer width="100%" height={72}>
            <BarChart
              data={revenueBarData}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis type="category" dataKey="channel" width={112} tick={{ fontSize: 12 }} />
              <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                {revenueBarData.map((entry) => (
                  <Cell key={entry.channel} fill={entry.fill} />
                ))}
              </Bar>
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Share of total revenue']}
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 flex justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-purple-600" />
              <span>DTC {dtcPct}%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-blue-600" />
              <span>B2B collected {b2bPct}%</span>
            </div>
          </div>
        </Card>

        <div>
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
              Alerts
            </h3>
            {sf?.primaryRegionLabel ? (
              <Badge variant="outline" className="font-normal">
                {sf.primaryRegionLabel}
              </Badge>
            ) : null}
          </div>
          {alerts.length === 0 ? (
            <Card className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Inbox className="h-4 w-4" />
              </span>
              <span>No SF, stock, or finance alerts right now.</span>
            </Card>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <Card
                  key={alert.id}
                  className={`border-l-4 border-r-0 border-t-0 border-b-0 p-4 ${alertBorderClass(alert.severity)}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          alert.severity === 'high'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        <Bell className="h-4 w-4" />
                      </span>
                      <p className="text-sm text-foreground">{alert.text}</p>
                    </div>
                    <Badge variant={alert.severity === 'high' ? 'destructive' : 'secondary'}>
                      {alert.severity}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border-l-4 border-l-purple-600 border-r-0 border-t-0 border-b-0 p-6">
            <SectionCardTitle icon={ShoppingCart}>Recent DTC orders</SectionCardTitle>
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {order.customer}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.channel} ·{' '}
                        {formatDistanceToNow(new Date(order.orderedAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatGhs(order.totalAmount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="border-l-4 border-l-blue-600 border-r-0 border-t-0 border-b-0 p-6">
            <SectionCardTitle icon={CalendarClock}>Upcoming shop visits</SectionCardTitle>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scheduled visits from today onward on the SF dashboard.
              </p>
            ) : (
              <div className="space-y-3">
                {upcoming.map((visit) => (
                  <div
                    key={visit.id}
                    className="flex items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {visit.outlet}
                      </p>
                      <p className="text-xs text-muted-foreground">{visit.rep}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(visit.scheduledAt), 'd MMM')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom range</DialogTitle>
            <DialogDescription>Pick a start and end date/time.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="master-custom-start">From</Label>
              <Input
                id="master-custom-start"
                type="datetime-local"
                value={customDraft.start}
                onChange={(e) => setCustomDraft((d) => ({ ...d, start: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="master-custom-end">To</Label>
              <Input
                id="master-custom-end"
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
                if (rangePreset === 'custom') setRangePreset('30d')
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
