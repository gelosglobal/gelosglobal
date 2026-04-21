'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Loader2, RefreshCw, ShoppingCart, TriangleAlert, Wallet } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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

type DtcDashboardSnapshot = {
  generatedAt: string
  periodDays: number
  periodStart: string
  periodEnd: string
  kpis: {
    orders: number
    units: number
    revenueGhs: number
    avgOrderValueGhs: number
    awaitingFulfillment: number
    skusTracked: number
    belowSafety: number
  }
  topSkus: Array<{
    sku: string
    name: string
    units: number
    revenueGhs: number
  }>
  alerts: Array<{ id: string; severity: 'high' | 'medium'; text: string }>
}

function severityBadge(s: 'high' | 'medium') {
  if (s === 'high') return <Badge variant="destructive">High</Badge>
  return <Badge variant="secondary">Medium</Badge>
}

export function DtcDashboardView() {
  const [data, setData] = useState<DtcDashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dtc/dashboard', { credentials: 'include' })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      setData((await res.json()) as DtcDashboardSnapshot)
    } catch {
      toast.error('Could not load DTC dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const generatedLabel = useMemo(() => {
    if (!data) return ''
    const d = new Date(data.generatedAt)
    return `Updated ${formatDistanceToNow(d, { addSuffix: true })}`
  }, [data])

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Dashboard"
        description="A quick pulse on orders, revenue, and inventory health."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <Empty className="border-0 py-16">
            <EmptyHeader>
              <EmptyTitle>No dashboard data</EmptyTitle>
              <EmptyDescription>
                Try refreshing. If it persists, check your database connection.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Last {data.periodDays} days · {generatedLabel}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Revenue</p>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{formatGhs(data.kpis.revenueGhs)}</p>
                <p className="text-xs text-muted-foreground">DTC only (excludes B2B)</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Orders</p>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{data.kpis.orders.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  Avg order value {formatGhs(data.kpis.avgOrderValueGhs)}
                </p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Units</p>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{data.kpis.units.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total units ordered</p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Alerts</p>
                  <TriangleAlert className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums">{data.kpis.belowSafety.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  SKUs below safety · {data.kpis.awaitingFulfillment.toLocaleString()} awaiting fulfillment
                </p>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-0">
                <div className="border-b border-border p-4">
                  <p className="text-sm font-semibold">Top SKUs (units)</p>
                  <p className="text-xs text-muted-foreground">Last {data.periodDays} days</p>
                </div>
                {data.topSkus.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No SKU activity in this period.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Units</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topSkus.map((r) => (
                        <TableRow key={r.sku}>
                          <TableCell className="font-mono text-xs font-medium">{r.sku}</TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatGhs(r.revenueGhs)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>

              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-md bg-muted p-2">
                    <TriangleAlert className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Inventory focus</p>
                    <p className="text-sm text-muted-foreground">
                      You have <span className="font-medium text-foreground">{data.kpis.skusTracked}</span> SKUs tracked
                      in DTC inventory and{' '}
                      <span className="font-medium text-foreground">{data.kpis.belowSafety}</span> currently below safety
                      stock.
                    </p>
                    <div className="mt-3">
                      <Button asChild variant="outline" size="sm">
                        <a href="/dtc/inventory">Open DTC Inventory</a>
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h2 className="text-sm font-semibold uppercase tracking-wide">Alerts</h2>
              </div>
              {data.alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No stock, order, or receivable alerts right now.</p>
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
        )}
      </div>
    </div>
  )
}

