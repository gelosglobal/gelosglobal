'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { format, formatDistanceToNow, startOfDay, startOfMonth } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  CalendarClock,
  ChevronDown,
  CreditCard,
  Footprints,
  Inbox,
  LayoutGrid,
  Loader2,
  Map,
  MapPin,
  Minus,
  Package,
  PieChart,
  PiggyBank,
  RefreshCw,
  ShoppingBag,
  ShoppingCart,
  Store,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Warehouse,
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { PageHeader } from '@/components/page-header'

type RangePreset = 'all' | '24h' | '7d' | '30d' | 'today' | 'mtd' | 'custom'

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
  b2bPortalOrderRevenue?: number
  b2bInvoiceRevenue?: number
  b2bInvoicePaidGhs?: number
  b2bCashCollections?: number
  totalRevenue: number
  cogsPctOfRevenue: number
  cogsGhs: number
  grossProfit: number
  marketingSpendGhs: number
  fixedOpexPeriodGhs: number
  netProfit: number
}

function growthPct(current: number, prior: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(prior)) return null
  if (prior > 0) return ((current - prior) / prior) * 100
  if (current > 0) return null
  return 0
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <Badge variant="outline">No prior baseline</Badge>
  }
  if (Math.abs(pct) < 0.05) {
    return (
      <Badge variant="outline" className="gap-1">
        <Minus className="h-3 w-3" />
        Flat vs prior
      </Badge>
    )
  }
  const positive = pct > 0
  return (
    <Badge className={positive ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-red-600 hover:bg-red-600'}>
      {positive ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
      {positive ? '+' : ''}
      {pct.toFixed(1)}% vs prior
    </Badge>
  )
}

function MarginBar({ label, pct, tone }: { label: string; pct: number; tone: 'emerald' | 'blue' | 'amber' | 'red' }) {
  const width = Math.min(100, Math.max(0, Math.abs(pct)))
  const fill =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'blue'
        ? 'bg-blue-500'
        : tone === 'amber'
          ? 'bg-amber-500'
          : 'bg-red-500'
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toIso(value: string): string | undefined {
  const v = value.trim()
  if (!v) return undefined
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

function orderInRange(orderedAt: string, startIso?: string, endIso?: string) {
  if (!startIso || !endIso) return true
  const t = new Date(orderedAt).getTime()
  if (Number.isNaN(t)) return false
  return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime()
}

type OrderRow = {
  id: string
  orderNumber: string
  customer: string
  channel: string
  totalAmount: number
  orderedAt: string
}

type RepTaskPriority = 'low' | 'medium' | 'high'
type RepTaskStatus = 'started' | 'in_progress' | 'done'
type RepTaskRow = {
  id: string
  repName: string
  title: string
  dueAt: string | null
  priority: RepTaskPriority
  status: RepTaskStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

const QUICK_LINKS: { href: string; label: string; icon: typeof Package }[] = [
  { href: '/dtc/orders-engine', label: 'Orders Engine', icon: Package },
  { href: '/dtc/inventory', label: 'DTC Inventory', icon: Package },
  { href: '/dtc/wholesale-inventory', label: 'Wholesale Inventory', icon: Warehouse },
  { href: '/sf/dashboard', label: 'Retail Dashboard', icon: Target },
  { href: '/sf/shop-visits', label: 'Shop Visits', icon: Store },
  { href: '/sf/outlet-scouting', label: 'Outlet Scouting', icon: Map },
  { href: '/sf/outlet-scout-map', label: 'Scout Map', icon: MapPin },
  { href: '/sf/posm-tracker', label: 'POSM Tracker', icon: Target },
  { href: '/sf/inventory', label: 'Retail Inventory', icon: Package },
  { href: '/sf/product-performance', label: 'Retail Product Performance', icon: TrendingUp },
  { href: '/sf/b2b-payments', label: 'B2B Payments', icon: CreditCard },
  { href: '/sf/targets', label: 'Targets & Quotas', icon: Target },
  { href: '/sf/reports', label: 'Retail Reports', icon: BarChart3 },
  { href: '/sf/leaderboard', label: 'Rep Leaderboard', icon: BarChart3 },
]

function MasterKpiCard({
  icon: Icon,
  iconWrapClass,
  iconClass,
  label,
  value,
  subtitle,
}: {
  icon: LucideIcon
  iconWrapClass: string
  iconClass: string
  label: string
  value: ReactNode
  subtitle: ReactNode
}) {
  return (
    <Card className="dashboard-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className={`shrink-0 rounded-2xl p-3 ${iconWrapClass}`}>
          <Icon className={`h-5 w-5 ${iconClass}`} />
        </div>
      </div>
    </Card>
  )
}

function DashboardSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-4 w-1 rounded-full bg-primary" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      {children}
    </section>
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

export function ManagerDashboard({
  taskOpen: taskOpenProp,
  onTaskOpenChange,
}: {
  taskOpen?: boolean
  onTaskOpenChange?: (open: boolean) => void
} = {}) {
  const [loading, setLoading] = useState(true)
  const [sf, setSf] = useState<SfDashboardPayload | null>(null)
  const [finance, setFinance] = useState<FinancePayload | null>(null)
  const [priorFinance, setPriorFinance] = useState<FinancePayload | null>(null)
  const [priorSf, setPriorSf] = useState<SfDashboardPayload | null>(null)
  /** Net invoiced in the selected date range (B2B Payments). */
  const [b2bPaymentsOutstandingGhs, setB2bPaymentsOutstandingGhs] = useState<number | null>(null)
  const [b2bPaymentsInvoicedGhs, setB2bPaymentsInvoicedGhs] = useState<number | null>(null)
  const b2bCollectedForTotalRevenue =
    (finance?.b2bInvoicePaidGhs ?? 0) +
    (finance?.b2bCashCollections ?? 0) +
    (finance?.b2bPortalOrderRevenue ?? 0)
  const totalRevenueDtcPlusB2bGhs =
    finance === null ? null : Math.max(0, finance.dtcRevenue) + Math.max(0, b2bCollectedForTotalRevenue)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [tasks, setTasks] = useState<RepTaskRow[]>([])

  const [taskOpenInternal, setTaskOpenInternal] = useState(false)
  const taskOpen = taskOpenProp ?? taskOpenInternal
  const setTaskOpen = onTaskOpenChange ?? setTaskOpenInternal
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskForm, setTaskForm] = useState({
    repName: '',
    title: '',
    dueDate: '',
    priority: 'medium' as RepTaskPriority,
    notes: '',
  })

  const [rangePreset, setRangePreset] = useState<RangePreset>('30d')
  const [customOpen, setCustomOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    return toDatetimeLocalValue(start)
  })
  const [rangeEnd, setRangeEnd] = useState<string>(() => toDatetimeLocalValue(new Date()))
  const [customDraft, setCustomDraft] = useState(() => ({ start: rangeStart, end: rangeEnd }))
  const [alertsOpen, setAlertsOpen] = useState(false)

  function applyPreset(preset: Exclude<RangePreset, 'custom'>) {
    const end = new Date()
    let start: Date
    if (preset === 'all') start = new Date(0)
    else if (preset === '24h') start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
    else if (preset === '7d') start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
    else if (preset === '30d') start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    else if (preset === 'today') start = startOfDay(end)
    else start = startOfMonth(end)
    const s = toDatetimeLocalValue(start)
    const e = toDatetimeLocalValue(end)
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
      const b2bQs = new URLSearchParams()
      const priorSfQs = new URLSearchParams()
      const priorFinQs = new URLSearchParams()
      if (startIso && endIso) {
        sfQs.set('start', startIso)
        sfQs.set('end', endIso)
        finQs.set('start', startIso)
        finQs.set('end', endIso)
        b2bQs.set('start', startIso)
        b2bQs.set('end', endIso)

        const start = new Date(startIso)
        const end = new Date(endIso)
        const windowMs = Math.max(0, end.getTime() - start.getTime())
        const priorEnd = start.toISOString()
        const priorStart = new Date(start.getTime() - windowMs).toISOString()
        priorSfQs.set('start', priorStart)
        priorSfQs.set('end', priorEnd)
        priorFinQs.set('start', priorStart)
        priorFinQs.set('end', priorEnd)
      } else {
        b2bQs.set('periodDays', '0')
      }

      const priorFinUrl = priorFinQs.toString()
        ? `/api/dtc/finance-layer?${priorFinQs.toString()}`
        : null
      const priorSfUrl = priorSfQs.toString()
        ? `/api/sf/dashboard?${priorSfQs.toString()}`
        : null

      const [sfRes, finRes, b2bPayRes, ordRes, taskRes, priorFinRes, priorSfRes] =
        await Promise.all([
        fetch(`/api/sf/dashboard${sfQs.toString() ? `?${sfQs.toString()}` : ''}`, {
          credentials: 'include',
        }),
        fetch(`/api/dtc/finance-layer${finQs.toString() ? `?${finQs.toString()}` : ''}`, {
          credentials: 'include',
        }),
        fetch(`/api/sf/b2b-payments?${b2bQs.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/api/dtc/orders', { credentials: 'include' }),
        fetch('/api/master/rep-tasks', { credentials: 'include' }),
        priorFinUrl
          ? fetch(priorFinUrl, { credentials: 'include' })
          : Promise.resolve(new Response(JSON.stringify(null), { status: 200 })),
        priorSfUrl
          ? fetch(priorSfUrl, { credentials: 'include' })
          : Promise.resolve(new Response(JSON.stringify(null), { status: 200 })),
      ])

      if (
        sfRes.status === 401 ||
        finRes.status === 401 ||
        b2bPayRes.status === 401 ||
        ordRes.status === 401 ||
        taskRes.status === 401
      ) {
        toast.error('Session expired. Sign in again.')
        return
      }

      if (!sfRes.ok || !finRes.ok || !b2bPayRes.ok || !ordRes.ok || !taskRes.ok) {
        throw new Error('One or more requests failed')
      }

      const sfJson = (await sfRes.json()) as SfDashboardPayload
      const finJson = (await finRes.json()) as FinancePayload
      const b2bPayJson = (await b2bPayRes.json()) as {
        kpis?: { outstandingGhs?: number; invoicedGhs?: number }
      }
      const ordJson = (await ordRes.json()) as { orders: OrderRow[] }
      const taskJson = (await taskRes.json()) as { tasks: RepTaskRow[] }

      setSf(sfJson)
      setFinance(finJson)
      if (priorFinRes.ok) {
        const priorJson = (await priorFinRes.json()) as FinancePayload | null
        setPriorFinance(priorJson && typeof priorJson === 'object' ? priorJson : null)
      } else {
        setPriorFinance(null)
      }
      if (priorSfRes.ok) {
        const priorSfJson = (await priorSfRes.json()) as SfDashboardPayload | null
        setPriorSf(priorSfJson && typeof priorSfJson === 'object' ? priorSfJson : null)
      } else {
        setPriorSf(null)
      }
      const out = b2bPayJson.kpis?.outstandingGhs
      setB2bPaymentsOutstandingGhs(
        typeof out === 'number' && Number.isFinite(out) ? Math.max(0, out) : 0,
      )
      const inv = b2bPayJson.kpis?.invoicedGhs
      setB2bPaymentsInvoicedGhs(
        typeof inv === 'number' && Number.isFinite(inv) ? Math.max(0, inv) : 0,
      )

      const ordersInRange = (ordJson.orders ?? []).filter((o) =>
        orderInRange(o.orderedAt, startIso, endIso),
      )
      setOrders(ordersInRange)
      setTasks(taskJson.tasks ?? [])
    } catch {
      toast.error('Could not load master dashboard data')
      setSf(null)
      setFinance(null)
      setPriorFinance(null)
      setPriorSf(null)
      setB2bPaymentsOutstandingGhs(null)
      setB2bPaymentsInvoicedGhs(null)
      setOrders([])
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [rangeEnd, rangeStart])

  useEffect(() => {
    void load()
  }, [load])

  const splitDtc = finance?.dtcRevenue ?? 0
  const splitB2b = b2bPaymentsInvoicedGhs ?? 0
  const totalRev = Math.max(0, splitDtc) + Math.max(0, splitB2b)
  const dtcPct =
    totalRev > 0
      ? Math.min(100, Math.round((Math.max(0, splitDtc) / totalRev) * 1000) / 10)
      : 0
  const b2bPct =
    totalRev > 0
      ? Math.min(100, Math.round((Math.max(0, splitB2b) / totalRev) * 1000) / 10)
      : 0

  const revenueBarData = [
    { channel: 'DTC', percentage: dtcPct, fill: '#7c3aed' },
    { channel: 'B2B invoiced', percentage: b2bPct, fill: '#2563eb' },
  ]

  const priorB2bCollected =
    (priorFinance?.b2bInvoicePaidGhs ?? 0) +
    (priorFinance?.b2bCashCollections ?? 0) +
    (priorFinance?.b2bPortalOrderRevenue ?? 0)
  const priorTotalRevenue =
    priorFinance === null
      ? null
      : Math.max(0, priorFinance.dtcRevenue) + Math.max(0, priorB2bCollected)

  const growthMetrics = useMemo(() => {
    if (!finance) return null
    const currentTotal = totalRevenueDtcPlusB2bGhs ?? 0
    return {
      totalRevenue: {
        current: currentTotal,
        growth: growthPct(currentTotal, priorTotalRevenue ?? 0),
      },
      dtcRevenue: {
        current: finance.dtcRevenue,
        growth: growthPct(finance.dtcRevenue, priorFinance?.dtcRevenue ?? 0),
      },
      b2bCollected: {
        current: b2bCollectedForTotalRevenue,
        growth: growthPct(b2bCollectedForTotalRevenue, priorB2bCollected),
      },
      netProfit: {
        current: finance.netProfit,
        growth: growthPct(finance.netProfit, priorFinance?.netProfit ?? 0),
      },
      sfVisits: {
        current: sf?.kpis.visits ?? 0,
        growth: growthPct(sf?.kpis.visits ?? 0, priorSf?.kpis.visits ?? 0),
      },
    }
  }, [
    finance,
    priorFinance,
    priorSf,
    priorTotalRevenue,
    priorB2bCollected,
    sf,
    totalRevenueDtcPlusB2bGhs,
    b2bCollectedForTotalRevenue,
  ])

  const plMetrics = useMemo(() => {
    if (!finance || totalRevenueDtcPlusB2bGhs === null) return null
    const revenue = Math.max(0, totalRevenueDtcPlusB2bGhs)
    const grossMarginPct = revenue > 0 ? (finance.grossProfit / revenue) * 100 : 0
    const netMarginPct = revenue > 0 ? (finance.netProfit / revenue) * 100 : 0
    const maxBar = Math.max(
      revenue,
      finance.grossProfit,
      Math.abs(finance.netProfit),
      finance.cogsGhs,
      finance.marketingSpendGhs,
      finance.fixedOpexPeriodGhs,
      1,
    )
    return {
      revenue,
      grossMarginPct,
      netMarginPct,
      maxBar,
      steps: [
        { key: 'revenue', label: 'Revenue', value: revenue, color: 'bg-blue-600' },
        { key: 'cogs', label: 'COGS', value: finance.cogsGhs, color: 'bg-orange-500' },
        { key: 'gross', label: 'Gross profit', value: finance.grossProfit, color: 'bg-emerald-600' },
        {
          key: 'marketing',
          label: 'Marketing',
          value: finance.marketingSpendGhs,
          color: 'bg-violet-500',
        },
        { key: 'opex', label: 'Fixed opex', value: finance.fixedOpexPeriodGhs, color: 'bg-slate-500' },
        {
          key: 'net',
          label: 'Net profit',
          value: finance.netProfit,
          color: finance.netProfit >= 0 ? 'bg-emerald-700' : 'bg-red-600',
        },
      ],
    }
  }, [finance, totalRevenueDtcPlusB2bGhs])

  const plChartData = useMemo(() => {
    if (!plMetrics) return []
    return plMetrics.steps.map((s) => ({
      name: s.label,
      amount: s.value,
      fill:
        s.key === 'revenue'
          ? '#2563eb'
          : s.key === 'cogs'
            ? '#f97316'
            : s.key === 'gross'
              ? '#059669'
              : s.key === 'marketing'
                ? '#7c3aed'
                : s.key === 'opex'
                  ? '#64748b'
                  : s.value >= 0
                    ? '#047857'
                    : '#dc2626',
    }))
  }, [plMetrics])

  const recentOrders = orders.slice(0, 6)
  const upcoming = sf?.upcomingVisits.slice(0, 6) ?? []
  const alerts = sf?.alerts.slice(0, 10) ?? []
  const highAlertCount = alerts.filter((a) => a.severity === 'high').length
  const mediumAlertCount = alerts.filter((a) => a.severity === 'medium').length
  const repOptions = Array.from(new Set((sf?.repPulse ?? []).map((r) => r.rep))).sort((a, b) =>
    a.localeCompare(b),
  )

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    const repName = taskForm.repName.trim()
    const title = taskForm.title.trim()
    if (!repName) return toast.error('Pick a rep')
    if (!title) return toast.error('Task title is required')
    setTaskSaving(true)
    try {
      const dueAt = taskForm.dueDate.trim()
        ? new Date(`${taskForm.dueDate}T12:00:00.000Z`).toISOString()
        : undefined
      const res = await fetch('/api/master/rep-tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repName,
          title,
          dueAt,
          priority: taskForm.priority,
          notes: taskForm.notes.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to create task')
      toast.success('Task assigned')
      setTaskOpen(false)
      setTaskForm({ repName: '', title: '', dueDate: '', priority: 'medium', notes: '' })
      await load()
    } catch {
      toast.error('Could not assign task')
    } finally {
      setTaskSaving(false)
    }
  }

  const headerDate = format(new Date(), 'd MMM yyyy')
  const rangeLabel = (() => {
    const s = toIso(rangeStart)
    const e = toIso(rangeEnd)
    if (!s || !e) return null
    return `${format(new Date(s), 'd MMM · HH:mm')} → ${format(new Date(e), 'd MMM · HH:mm')}`
  })()

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="Main"
        title="Master Dashboard"
        description="Live roll-up from Finance Layer, Sales Force, and DTC orders"
        meta={
          rangeLabel ? <p className="text-xs text-muted-foreground">{rangeLabel}</p> : null
        }
        actions={
          <>
            <p className="hidden text-sm text-muted-foreground sm:block">{headerDate}</p>
            {loading && (sf || finance) ? (
              <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
                <Loader2 className="h-3 w-3 animate-spin" />
                Updating
              </Badge>
            ) : null}
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
                <SelectItem value="all">All time</SelectItem>
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
          </>
        }
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {loading && !sf && !finance ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin" />
            <p className="text-sm">Loading live metrics…</p>
          </div>
        ) : null}

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

        <DashboardSection title="Overview">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MasterKpiCard
            icon={Wallet}
            iconWrapClass="bg-blue-600/10"
            iconClass="text-blue-600"
            label="Total invoice"
            value={b2bPaymentsInvoicedGhs === null ? '—' : formatGhs(b2bPaymentsInvoicedGhs)}
            subtitle="B2B · Net invoiced in selected range"
          />
          <MasterKpiCard
            icon={ShoppingBag}
            iconWrapClass="bg-purple-600/10"
            iconClass="text-purple-600"
            label="DTC revenue"
            value={finance ? formatGhs(finance.dtcRevenue) : '—'}
            subtitle="DTC orders in selected range"
          />
          <MasterKpiCard
            icon={LayoutGrid}
            iconWrapClass="bg-amber-600/10"
            iconClass="text-amber-700"
            label="Total revenue (DTC + B2B)"
            value={totalRevenueDtcPlusB2bGhs === null ? '—' : formatGhs(totalRevenueDtcPlusB2bGhs)}
            subtitle="DTC orders + B2B paid, cash & portal in range"
          />
          <MasterKpiCard
            icon={Banknote}
            iconWrapClass="bg-green-600/10"
            iconClass="text-green-600"
            label="B2B collected"
            value={finance ? formatGhs(b2bCollectedForTotalRevenue) : '—'}
            subtitle="Invoice payments + cash + portal orders in range"
          />
          <MasterKpiCard
            icon={CreditCard}
            iconWrapClass="bg-red-600/10"
            iconClass="text-red-600"
            label="B2B outstanding"
            value={
              b2bPaymentsOutstandingGhs === null
                ? '—'
                : formatGhs(b2bPaymentsOutstandingGhs)
            }
            subtitle="Unpaid balance on invoices in selected range"
          />
          <MasterKpiCard
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
          </div>
        </DashboardSection>

        {finance && growthMetrics && plMetrics ? (
          <DashboardSection title="Growth & P&L">
            <div className="grid gap-4 xl:grid-cols-3">
            <Card className="dashboard-card p-6 xl:col-span-1">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </span>
                Growth vs prior period
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Total revenue', ...growthMetrics.totalRevenue },
                  { label: 'DTC revenue', ...growthMetrics.dtcRevenue },
                  { label: 'B2B collected', ...growthMetrics.b2bCollected },
                  { label: 'Net profit', ...growthMetrics.netProfit },
                  { label: 'SF visits', ...growthMetrics.sfVisits },
                ].map((row) => (
                  <div key={row.label} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium uppercase text-muted-foreground">{row.label}</p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {row.label === 'SF visits'
                            ? row.current.toLocaleString()
                            : formatGhs(row.current)}
                        </p>
                      </div>
                      <GrowthBadge pct={row.growth} />
                    </div>
                    {priorTotalRevenue !== null && row.growth !== null ? (
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            (row.growth ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                          style={{
                            width: `${Math.min(100, Math.max(8, Math.abs(row.growth ?? 0)))}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="dashboard-card p-6 xl:col-span-2">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <PiggyBank className="h-4 w-4 text-muted-foreground" />
                </span>
                Profit &amp; loss (selected range)
              </h3>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-3">
                  {plMetrics.steps.map((step) => (
                    <div key={step.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{step.label}</span>
                        <span
                          className={`font-semibold tabular-nums ${
                            step.key === 'net' && step.value < 0 ? 'text-red-600' : ''
                          }`}
                        >
                          {formatGhs(step.value)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${step.color}`}
                          style={{
                            width: `${Math.min(100, (Math.abs(step.value) / plMetrics.maxBar) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={plChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={56}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={56} />
                      <Tooltip
                        formatter={(value: number) => [formatGhs(value), 'Amount']}
                        contentStyle={{
                          backgroundColor: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                        }}
                      />
                      <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                        {plChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MarginBar
                      label="Gross margin"
                      pct={plMetrics.grossMarginPct}
                      tone="emerald"
                    />
                    <MarginBar
                      label="Net margin"
                      pct={plMetrics.netMarginPct}
                      tone={plMetrics.netMarginPct >= 0 ? 'blue' : 'red'}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    COGS at {(finance.cogsPctOfRevenue * 100).toFixed(1)}% of revenue · Marketing and
                    fixed opex prorated to the selected window.
                  </p>
                </div>
              </div>
            </Card>
            </div>
          </DashboardSection>
        ) : null}

        <DashboardSection title="Channel mix">
          <Card className="dashboard-card p-6">
          <h3 className="mb-6 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </span>
            Revenue split — DTC vs B2B invoiced (selected range)
          </h3>
          <ResponsiveContainer width="100%" height={96}>
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
              <span>B2B invoiced {b2bPct}%</span>
            </div>
          </div>
          </Card>
        </DashboardSection>

        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
          <Card className="dashboard-card overflow-hidden">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <AlertTriangle
                    className={`h-5 w-5 shrink-0 ${
                      highAlertCount > 0 ? 'text-red-600' : 'text-amber-600'
                    }`}
                  />
                  <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">
                    Alerts
                  </h3>
                  {sf?.primaryRegionLabel ? (
                    <Badge variant="outline" className="font-normal">
                      {sf.primaryRegionLabel}
                    </Badge>
                  ) : null}
                  {alerts.length > 0 ? (
                    <Badge variant="secondary">{alerts.length} active</Badge>
                  ) : (
                    <Badge variant="outline">All clear</Badge>
                  )}
                  {highAlertCount > 0 ? (
                    <Badge variant="destructive">{highAlertCount} high</Badge>
                  ) : null}
                  {mediumAlertCount > 0 ? (
                    <Badge className="bg-amber-600 hover:bg-amber-600">
                      {mediumAlertCount} medium
                    </Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">{alertsOpen ? 'Hide' : 'Show'}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${alertsOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-border p-4 pt-3">
                {alerts.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Inbox className="h-4 w-4" />
                    </span>
                    <span>No SF, stock, or finance alerts right now.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alerts.map((alert) => (
                      <Card
                        key={alert.id}
                        className={`dashboard-card p-4 ${alert.severity === 'high' ? 'ring-red-500/30' : 'ring-amber-500/30'}`}
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
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <DashboardSection title="Operations">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="dashboard-card p-6">
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

          <Card className="dashboard-card p-6">
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

          <Card className="dashboard-card mt-6 p-6">
          <SectionCardTitle icon={LayoutGrid}>Rep tasks</SectionCardTitle>

          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>
          ) : (
            <div className="space-y-3">
              {tasks.slice(0, 10).map((t) => (
                <div
                  key={t.id}
                  className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.repName}
                      {t.dueAt ? ` · due ${format(new Date(t.dueAt), 'd MMM')}` : ''}
                      {t.priority ? ` · ${t.priority}` : ''}
                      {t.status ? ` · ${t.status}` : ''}
                    </p>
                    {t.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{t.notes}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                    <Badge
                      variant={
                        t.status === 'done'
                          ? 'secondary'
                          : t.status === 'in_progress'
                            ? 'outline'
                            : 'outline'
                      }
                    >
                      {t.status === 'done'
                        ? 'Done'
                        : t.status === 'in_progress'
                          ? 'In progress'
                          : 'Started'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
        </DashboardSection>
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

      <Dialog open={taskOpen} onOpenChange={setTaskOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={createTask}>
            <DialogHeader>
              <DialogTitle>Assign task</DialogTitle>
              <DialogDescription>Assign a task to a rep (Master only).</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Rep</Label>
                <Select
                  value={taskForm.repName}
                  onValueChange={(v) => setTaskForm((f) => ({ ...f, repName: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {repOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                    {repOptions.length === 0 ? <SelectItem value="Unknown">Unknown</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-title">Task</Label>
                <Input
                  id="task-title"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Visit 10 outlets and collect balances"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="task-due">Due date (optional)</Label>
                  <Input
                    id="task-due"
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={taskForm.priority}
                    onValueChange={(v) =>
                      setTaskForm((f) => ({ ...f, priority: v as RepTaskPriority }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-notes">Notes (optional)</Label>
                <Input
                  id="task-notes"
                  value={taskForm.notes}
                  onChange={(e) => setTaskForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional context"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTaskOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={taskSaving}>
                {taskSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Assigning
                  </>
                ) : (
                  'Assign task'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
