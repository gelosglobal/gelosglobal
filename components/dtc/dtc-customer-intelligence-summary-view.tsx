'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { format, differenceInDays } from 'date-fns'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Banknote,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Users,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
import type { DtcCiOrderCustomerSummary } from '@/lib/dtc-customer-intelligence-order-summary'
import { formatGhs, type OrderStatus } from '@/lib/dtc-orders'
import { cn } from '@/lib/utils'

type RecentOrderRow = {
  id: string
  orderNumber: string
  customer: string
  totalAmount: number
  status: OrderStatus
  orderedAt: string
}

type SummaryPayload = {
  customers: DtcCiOrderCustomerSummary[]
  recentOrders: RecentOrderRow[]
}

/** Aligns with DTC customer segments: High LTV uses LTV ≥ 2k or orders ≥ 10. */
const HIGH_BILLED_MIN_GHS = 2000
const HIGH_BILLED_MIN_ORDERS = 10
/** “At risk” when last known sell-out was 60+ days ago (same idea as DTC customer list). */
const AT_RISK_MIN_DAYS = 60

type CustomerSegment = 'high' | 'at_risk' | 'new' | 'core'
type SegmentFilter = 'all' | CustomerSegment

type CustomerSortKey =
  | 'orders_desc'
  | 'orders_asc'
  | 'paid_desc'
  | 'paid_asc'
  | 'name_asc'
  | 'name_desc'
  | 'products_desc'

function CustomerIntelKpiCard({
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

function isHighBilled(c: DtcCiOrderCustomerSummary) {
  return (c.totalPaidGhs ?? 0) >= HIGH_BILLED_MIN_GHS || c.orderCount >= HIGH_BILLED_MIN_ORDERS
}

function isAtRisk(c: DtcCiOrderCustomerSummary, now = new Date()) {
  if (!c.lastOrderedAt) return false
  const last = new Date(c.lastOrderedAt)
  if (Number.isNaN(last.getTime())) return false
  return differenceInDays(now, last) >= AT_RISK_MIN_DAYS
}

function customerSegment(c: DtcCiOrderCustomerSummary): CustomerSegment {
  if (isAtRisk(c)) return 'at_risk'
  if (isHighBilled(c)) return 'high'
  if (c.orderCount <= 1) return 'new'
  return 'core'
}

function SegmentBadge({ segment }: { segment: CustomerSegment }) {
  switch (segment) {
    case 'high':
      return (
        <Badge className="bg-indigo-600 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-500">
          High LTV
        </Badge>
      )
    case 'at_risk':
      return <Badge variant="destructive">At risk</Badge>
    case 'new':
      return (
        <Badge variant="outline" className="border-sky-500/40 text-sky-700 dark:text-sky-400">
          New
        </Badge>
      )
    case 'core':
      return <Badge variant="secondary">Core</Badge>
  }
}

function statusBadge(status: OrderStatus) {
  switch (status) {
    case 'fulfilled':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Fulfilled</Badge>
    case 'processing':
      return <Badge variant="secondary">Processing</Badge>
    case 'pending_payment':
      return <Badge variant="outline">Pending payment</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function nameCompare(a: DtcCiOrderCustomerSummary, b: DtcCiOrderCustomerSummary) {
  return a.customerName.localeCompare(b.customerName, undefined, { sensitivity: 'base' })
}

function sortCustomers(list: DtcCiOrderCustomerSummary[], sort: CustomerSortKey): DtcCiOrderCustomerSummary[] {
  const out = [...list]
  out.sort((a, b) => {
    switch (sort) {
      case 'orders_desc':
        return (
          b.orderCount - a.orderCount ||
          (b.totalPaidGhs ?? 0) - (a.totalPaidGhs ?? 0) ||
          nameCompare(a, b)
        )
      case 'orders_asc':
        return (
          a.orderCount - b.orderCount ||
          (a.totalPaidGhs ?? 0) - (b.totalPaidGhs ?? 0) ||
          nameCompare(a, b)
        )
      case 'paid_desc':
        return (
          (b.totalPaidGhs ?? 0) - (a.totalPaidGhs ?? 0) ||
          b.orderCount - a.orderCount ||
          nameCompare(a, b)
        )
      case 'paid_asc':
        return (
          (a.totalPaidGhs ?? 0) - (b.totalPaidGhs ?? 0) ||
          a.orderCount - b.orderCount ||
          nameCompare(a, b)
        )
      case 'name_asc':
        return nameCompare(a, b) || b.orderCount - a.orderCount
      case 'name_desc':
        return nameCompare(b, a) || b.orderCount - a.orderCount
      case 'products_desc':
        return b.products.length - a.products.length || b.orderCount - a.orderCount || nameCompare(a, b)
      default:
        return 0
    }
  })
  return out
}

export function DtcCustomerIntelligenceSummaryView() {
  const [loading, setLoading] = useState(true)
  const [payload, setPayload] = useState<SummaryPayload | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerSort, setCustomerSort] = useState<CustomerSortKey>('orders_desc')
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dtc/customer-intelligence/summary', {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Failed to load summary')
      }
      const data = (await res.json()) as SummaryPayload
      setPayload(data)
    } catch {
      toast.error('Could not load customer intelligence')
      setPayload(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const customers = payload?.customers ?? []
  const recent = payload?.recentOrders ?? []

  const intelligenceKpis = useMemo(() => {
    const n = customers.length
    const sumBilled = customers.reduce((s, c) => s + (c.totalPaidGhs ?? 0), 0)
    const avgTotalBilled = n > 0 ? sumBilled / n : 0
    const highBilledCount = customers.filter(isHighBilled).length
    const atRiskCount = customers.filter(isAtRisk).length
    const atRiskPct = n > 0 ? (atRiskCount / n) * 100 : 0
    return {
      customersTracked: n,
      avgTotalBilled,
      highBilledCount,
      atRiskCount,
      atRiskPct,
    }
  }, [customers])

  const segmentInsights = useMemo(() => {
    const counts: Record<CustomerSegment, number> = {
      high: 0,
      at_risk: 0,
      new: 0,
      core: 0,
    }
    for (const c of customers) {
      counts[customerSegment(c)] += 1
    }
    const n = customers.length
    const activePct = n > 0 ? ((n - counts.at_risk) / n) * 100 : null
    return { ...counts, total: n, activePct }
  }, [customers])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    return customers.filter((c) => {
      if (segmentFilter !== 'all' && customerSegment(c) !== segmentFilter) return false
      if (!q) return true
      const hay = [c.customerName, c.customerPhone, c.customerLocation, String(c.totalPaidGhs ?? 0)]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [customers, customerQuery, segmentFilter])

  const sortedFilteredCustomers = useMemo(
    () => sortCustomers(filteredCustomers, customerSort),
    [filteredCustomers, customerSort],
  )

  const hasActiveFilters = Boolean(customerQuery.trim()) || segmentFilter !== 'all' || customerSort !== 'orders_desc'

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Customer Intelligence"
        description="Rolled-up buyer insights from sell-out orders and the CI ledger — segments, product affinity, and recent activity."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/dtc/orders-engine">
                Orders Engine
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CustomerIntelKpiCard
            label="Customers tracked"
            value={loading ? '—' : intelligenceKpis.customersTracked.toLocaleString()}
            subtitle="Distinct buyers (engine + ledger, deduped by order #)"
            icon={Users}
            iconWrapClass="bg-primary/10"
            iconClass="text-primary"
          />
          <CustomerIntelKpiCard
            label="Avg total billed"
            value={loading ? '—' : formatGhs(intelligenceKpis.avgTotalBilled)}
            subtitle="Mean rolled-up total per tracked customer"
            icon={Banknote}
            iconWrapClass="bg-violet-500/10"
            iconClass="text-violet-600 dark:text-violet-400"
          />
          <CustomerIntelKpiCard
            label="High billed"
            value={loading ? '—' : intelligenceKpis.highBilledCount.toLocaleString()}
            subtitle={`High LTV: ≥ ${formatGhs(HIGH_BILLED_MIN_GHS)} or ≥ ${HIGH_BILLED_MIN_ORDERS} orders`}
            icon={Crown}
            iconWrapClass="bg-emerald-500/10"
            iconClass="text-emerald-600 dark:text-emerald-400"
          />
          <CustomerIntelKpiCard
            label="At risk"
            value={
              loading
                ? '—'
                : `${intelligenceKpis.atRiskPct.toFixed(1)}%`
            }
            subtitle={
              loading
                ? `No sell-out in ${AT_RISK_MIN_DAYS}+ days`
                : `${intelligenceKpis.atRiskCount.toLocaleString()} customers · last order ${AT_RISK_MIN_DAYS}+ days ago`
            }
            icon={UserX}
            iconWrapClass="bg-rose-500/10"
            iconClass="text-rose-600 dark:text-rose-400"
          />
        </div>

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Customer segment mix</p>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? 'Calculating segments…'
                  : `${segmentInsights.total.toLocaleString()} tracked buyers · mutually exclusive buckets`}
              </p>
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {loading || segmentInsights.activePct === null
                ? '—'
                : `${segmentInsights.activePct.toFixed(0)}%`}
            </p>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {loading || segmentInsights.total === 0 ? (
              <div className="h-full w-0 rounded-full bg-primary" />
            ) : (
              <>
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${(segmentInsights.high / segmentInsights.total) * 100}%` }}
                />
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${(segmentInsights.at_risk / segmentInsights.total) * 100}%` }}
                />
                <div
                  className="h-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${(segmentInsights.new / segmentInsights.total) * 100}%` }}
                />
                <div
                  className="h-full bg-slate-400 transition-all duration-300 dark:bg-slate-500"
                  style={{ width: `${(segmentInsights.core / segmentInsights.total) * 100}%` }}
                />
              </>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              High LTV {loading ? '—' : segmentInsights.high}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              At risk {loading ? '—' : segmentInsights.at_risk}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              New {loading ? '—' : segmentInsights.new}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
              Core {loading ? '—' : segmentInsights.core}
            </span>
          </div>
        </Card>

        <Card className="dashboard-card p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Filter & sort</h2>
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomerQuery('')
                  setSegmentFilter('all')
                  setCustomerSort('orders_desc')
                }}
              >
                Reset filters
              </Button>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="ci-customer-search" className="text-muted-foreground">
                Search customers
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="ci-customer-search"
                  placeholder="Name, phone, location, or amount…"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  disabled={loading || customers.length === 0}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full space-y-2 sm:w-44">
                <Label className="text-muted-foreground">Segment</Label>
                <Select
                  value={segmentFilter}
                  onValueChange={(v) => setSegmentFilter(v as SegmentFilter)}
                  disabled={loading || customers.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All segments" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="all">All segments</SelectItem>
                    <SelectItem value="high">High LTV</SelectItem>
                    <SelectItem value="at_risk">At risk</SelectItem>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="core">Core</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full space-y-2 sm:w-52">
                <Label htmlFor="ci-customer-sort" className="text-muted-foreground">
                  Sort by
                </Label>
                <Select
                  value={customerSort}
                  onValueChange={(v) => setCustomerSort(v as CustomerSortKey)}
                  disabled={loading || customers.length === 0}
                >
                  <SelectTrigger id="ci-customer-sort" className="w-full">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="orders_desc">Orders (most first)</SelectItem>
                    <SelectItem value="orders_asc">Orders (fewest first)</SelectItem>
                    <SelectItem value="paid_desc">Total paid (high → low)</SelectItem>
                    <SelectItem value="paid_asc">Total paid (low → high)</SelectItem>
                    <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                    <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                    <SelectItem value="products_desc">Product lines (most first)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </Card>

        <Card className="dashboard-card overflow-hidden p-0">
          <div className="border-b border-border/60 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">Customers & products</h2>
                    {!loading ? (
                      <Badge variant="secondary" className="tabular-nums">
                        {sortedFilteredCustomers.length.toLocaleString()}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Times ordered = sell-outs with that SKU · Units = sum of line quantities
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0">
                <Link href="/dtc/orders-engine">Edit in Orders Engine</Link>
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading customers…
            </div>
          ) : customers.length === 0 ? (
            <div className="p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>No customers yet</EmptyTitle>
                  <EmptyDescription>
                    Open the Orders Engine to create sell-outs with line items. Imported ledger rows
                    will appear here too.
                  </EmptyDescription>
                </EmptyHeader>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/dtc/orders-engine">Go to Orders Engine</Link>
                </Button>
              </Empty>
            </div>
          ) : sortedFilteredCustomers.length === 0 ? (
            <div className="p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>No customers match your filters</EmptyTitle>
                  <EmptyDescription>
                    Try a different search term, segment, or reset filters.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <Accordion type="multiple" className="px-2 py-2 sm:px-4">
              {sortedFilteredCustomers.map((c) => {
                const segment = customerSegment(c)
                return (
                  <AccordionItem key={c.identityKey} value={c.identityKey} className="border-border/60">
                    <AccordionTrigger className="px-2 text-left hover:no-underline sm:px-4">
                      <div className="flex min-w-0 flex-1 flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{c.customerName}</p>
                            <SegmentBadge segment={segment} />
                          </div>
                          <p className="truncate text-xs text-muted-foreground tabular-nums">
                            {[c.customerPhone, c.customerLocation].filter(Boolean).join(' · ') || '—'}
                            {c.lastOrderedAt
                              ? ` · Last order ${format(new Date(c.lastOrderedAt), 'dd MMM yyyy')}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 text-xs sm:justify-end">
                          <Badge
                            variant="outline"
                            className="tabular-nums font-medium text-foreground"
                            title="Orders Engine: each sell-out’s total. Ledger: collected when present, otherwise amount to collect."
                          >
                            {formatGhs(c.totalPaidGhs ?? 0)} paid
                          </Badge>
                          <Badge variant="secondary" className="tabular-nums">
                            {c.orderCount} order{c.orderCount === 1 ? '' : 's'}
                          </Badge>
                          <Badge variant="outline" className="tabular-nums">
                            {c.products.length} product{c.products.length === 1 ? '' : 's'}
                          </Badge>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-2 pb-4 sm:px-4">
                      {c.products.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No line items on these orders.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-border/60">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-card">
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                                <TableHead className="text-right whitespace-nowrap">Times ordered</TableHead>
                                <TableHead className="text-right whitespace-nowrap">Units</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {c.products.map((p) => (
                                <TableRow key={p.key}>
                                  <TableCell className="max-w-[12rem] font-medium sm:max-w-none">
                                    {p.name}
                                  </TableCell>
                                  <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                                    {p.sku ?? '—'}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {p.timesOrdered.toLocaleString()}
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{p.units.toLocaleString()}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>
          )}

          <p className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:px-6">
            Sources: Orders Engine sell-outs plus the CI ledger (imports and history), skipping ledger rows
            whose order number already exists on an engine order. Identity merges on strong phone + name.
          </p>
        </Card>

        <Card className="dashboard-card overflow-hidden p-0">
          <div className="border-b border-border/60 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Recent sell-out orders</h2>
                {!loading && recent.length > 0 ? (
                  <Badge variant="secondary" className="tabular-nums">
                    {recent.length.toLocaleString()}
                  </Badge>
                ) : null}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/dtc/orders-engine">View all in Orders Engine</Link>
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading recent orders…
            </div>
          ) : recent.length === 0 ? (
            <div className="p-6">
              <Empty className="border-0 p-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShoppingCart className="h-6 w-6" />
                  </EmptyMedia>
                  <EmptyTitle>No orders yet</EmptyTitle>
                  <EmptyDescription>
                    Open the Orders Engine to create your first sell-out.
                  </EmptyDescription>
                </EmptyHeader>
                <Button asChild size="sm" className="mt-4" variant="outline">
                  <Link href="/dtc/orders-engine">Go to Orders Engine</Link>
                </Button>
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="hidden whitespace-nowrap sm:table-cell">Ordered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{o.orderNumber}</TableCell>
                      <TableCell className="max-w-[14rem] truncate font-medium">{o.customer}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatGhs(o.totalAmount)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{statusBadge(o.status)}</TableCell>
                      <TableCell className="hidden text-muted-foreground whitespace-nowrap sm:table-cell">
                        {format(new Date(o.orderedAt), 'dd MMM yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
