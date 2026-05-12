'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, differenceInDays } from 'date-fns'
import { Loader2, ShoppingCart, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
import type { DtcCiOrderCustomerSummary } from '@/lib/dtc-customer-intelligence-order-summary'
import { formatGhs, type OrderStatus } from '@/lib/dtc-orders'

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

type CustomerSortKey =
  | 'orders_desc'
  | 'orders_asc'
  | 'paid_desc'
  | 'paid_asc'
  | 'name_asc'
  | 'name_desc'
  | 'products_desc'

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
    const highBilledCount = customers.filter(
      (c) =>
        (c.totalPaidGhs ?? 0) >= HIGH_BILLED_MIN_GHS || c.orderCount >= HIGH_BILLED_MIN_ORDERS,
    ).length
    const now = new Date()
    const atRiskCount = customers.filter((c) => {
      if (!c.lastOrderedAt) return false
      const last = new Date(c.lastOrderedAt)
      if (Number.isNaN(last.getTime())) return false
      return differenceInDays(now, last) >= AT_RISK_MIN_DAYS
    }).length
    return {
      customersTracked: n,
      avgTotalBilled,
      highBilledCount,
      atRiskCount,
    }
  }, [customers])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => {
      const hay = [c.customerName, c.customerPhone, c.customerLocation, String(c.totalPaidGhs ?? 0)]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [customers, customerQuery])

  const sortedFilteredCustomers = useMemo(
    () => sortCustomers(filteredCustomers, customerSort),
    [filteredCustomers, customerSort],
  )

  return (
    <div className="flex-1 space-y-6 p-4 sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            Loading summary…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-sky-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Customers tracked
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {intelligenceKpis.customersTracked.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Distinct rolled-up buyers (Orders Engine + CI ledger, deduped by order #)
                </p>
              </Card>
              <Card className="border-l-4 border-l-violet-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Avg total billed
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {formatGhs(intelligenceKpis.avgTotalBilled)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Mean rolled-up total per tracked customer</p>
              </Card>
              <Card className="border-l-4 border-l-emerald-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  High billed
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {intelligenceKpis.highBilledCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Same rule as High LTV: ≥ {formatGhs(HIGH_BILLED_MIN_GHS)} total or ≥ {HIGH_BILLED_MIN_ORDERS}{' '}
                  orders
                </p>
              </Card>
              <Card className="border-l-4 border-l-rose-600 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">At risk</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {intelligenceKpis.atRiskCount.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last known sell-out {AT_RISK_MIN_DAYS}+ days ago (needs a dated order or ledger row)
                </p>
              </Card>
            </div>

            <Card className="p-0">
              <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                      Customers & products
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      “Times ordered” = sell-out orders that included that product; “Units” = sum of line
                      quantities. “Total paid” sums order totals (engine) or collected / due amounts (ledger).
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" asChild className="shrink-0 self-start sm:self-auto">
                  <Link href="/dtc/orders-engine">Edit in Orders Engine</Link>
                </Button>
              </div>
              <div className="flex flex-col gap-4 border-b border-border px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="ci-customer-search" className="text-muted-foreground">
                    Search customers
                  </Label>
                  <Input
                    id="ci-customer-search"
                    className="mt-1.5 max-w-md"
                    placeholder="Name, phone, location, or amount…"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                    disabled={customers.length === 0}
                  />
                </div>
                <div className="w-full shrink-0 sm:w-[min(100%,14rem)]">
                  <Label htmlFor="ci-customer-sort" className="text-muted-foreground">
                    Sort by
                  </Label>
                  <Select
                    value={customerSort}
                    onValueChange={(v) => setCustomerSort(v as CustomerSortKey)}
                    disabled={customers.length === 0}
                  >
                    <SelectTrigger id="ci-customer-sort" className="mt-1.5 w-full">
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
              {customers.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
                  No orders yet. Open the Orders Engine to create sell-outs with line items.
                </p>
              ) : sortedFilteredCustomers.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
                  No customers match your search.
                </p>
              ) : (
                <Accordion type="multiple" className="px-2 py-2 sm:px-4">
                  {sortedFilteredCustomers.map((c) => (
                    <AccordionItem key={c.identityKey} value={c.identityKey} className="border-border">
                      <AccordionTrigger className="px-2 text-left hover:no-underline sm:px-4">
                        <div className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{c.customerName}</p>
                            <p className="truncate text-xs text-muted-foreground tabular-nums">
                              {[c.customerPhone, c.customerLocation].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted-foreground sm:justify-end">
                            <Badge
                              variant="outline"
                              className="tabular-nums font-medium text-foreground"
                              title="Orders Engine: each sell-out’s total. Ledger: collected (cash / MoMo / Paystack / total collected) when present, otherwise amount to collect."
                            >
                              Total paid {formatGhs(c.totalPaidGhs ?? 0)}
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
                          <div className="overflow-x-auto rounded-md border border-border">
                            <Table>
                              <TableHeader>
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
                  ))}
                </Accordion>
              )}
              <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6">
                {
                  'Sources: Orders Engine (Mongo sell-outs) plus the Customer Intelligence ledger (imports and history), skipping ledger rows whose order number already exists on an engine order. Identity: strong phone + customer name merge; blank name → one row per sell-out; weak phone → email + name, then name only.'
                }
              </p>
            </Card>

            <Card className="p-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    Recent sell-out orders
                  </h2>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dtc/orders-engine">View all in Orders Engine</Link>
                </Button>
              </div>
              {recent.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
                  No orders yet. Open the Orders Engine to create your first sell-out.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
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
          </>
        )}
      </div>
  )
}
