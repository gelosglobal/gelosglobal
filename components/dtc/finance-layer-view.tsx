'use client'

import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import {
  Banknote,
  Download,
  Loader2,
  PiggyBank,
  Settings2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatGhs } from '@/lib/dtc-orders'
import type { PaymentMethod } from '@/lib/dtc-orders'

type PaymentSplitRow = {
  method: PaymentMethod
  label: string
  orders: number
  revenue: number
}

type FinancePayload = {
  periodDays: number
  periodStart: string
  periodEnd: string
  dtcRevenue: number
  b2bPortalOrderRevenue: number
  b2bInvoiceRevenue?: number
  b2bInvoicePaidGhs?: number
  b2bCashCollections: number
  b2bCollected: number
  totalRevenue: number
  cogsPctOfRevenue: number
  cogsGhs: number
  grossProfit: number
  marketingSpendGhs: number
  fixedOpexPeriodGhs: number
  netProfit: number
  b2bOutstandingGhs: number
  paymentSplit: PaymentSplitRow[]
  config: {
    b2bOutstandingGhs: number
    cogsPctOfRevenue: number
    fixedOpexPeriodGhs: number
  }
}

const PERIOD_OPTIONS = [7, 30, 90] as const

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: {
  title: string
  value: string
  subtitle?: string
  icon: typeof Wallet
  accent?: 'default' | 'positive' | 'negative'
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums tracking-tight sm:text-3xl ${
              accent === 'positive'
                ? 'text-emerald-600 dark:text-emerald-500'
                : accent === 'negative'
                  ? 'text-red-600 dark:text-red-500'
                  : ''
            }`}
          >
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="rounded-lg bg-muted/80 p-2 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

export function FinanceLayerView() {
  const [periodDays, setPeriodDays] = useState<number>(30)
  const [data, setData] = useState<FinancePayload | null>(null)
  const [loading, setLoading] = useState(true)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    b2bOutstandingGhs: '',
    cogsPercent: '', // 0-100 for display
    fixedOpexPeriodGhs: '',
  })

  const [cashOpen, setCashOpen] = useState(false)
  const [cashSaving, setCashSaving] = useState(false)
  const [cashForm, setCashForm] = useState({
    amountGhs: '',
    collectedAt: new Date().toISOString().slice(0, 10),
    note: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/dtc/finance-layer?days=${periodDays}`,
        { credentials: 'include' },
      )
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed to load')
      const json = (await res.json()) as FinancePayload
      setData(json)
      setSettingsForm({
        b2bOutstandingGhs: String(json.config.b2bOutstandingGhs),
        cogsPercent: String(Math.round(json.config.cogsPctOfRevenue * 1000) / 10),
        fixedOpexPeriodGhs: String(json.config.fixedOpexPeriodGhs),
      })
    } catch {
      toast.error('Could not load finance data')
    } finally {
      setLoading(false)
    }
  }, [periodDays])

  useEffect(() => {
    void load()
  }, [load])

  function openSettings() {
    if (data) {
      setSettingsForm({
        b2bOutstandingGhs: String(data.config.b2bOutstandingGhs),
        cogsPercent: String(Math.round(data.config.cogsPctOfRevenue * 1000) / 10),
        fixedOpexPeriodGhs: String(data.config.fixedOpexPeriodGhs),
      })
    }
    setSettingsOpen(true)
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault()
    const b2b = Number(settingsForm.b2bOutstandingGhs)
    const cogsPct = Number(settingsForm.cogsPercent)
    const opex = Number(settingsForm.fixedOpexPeriodGhs)
    if (!Number.isFinite(b2b) || b2b < 0) {
      toast.error('Invalid B2B outstanding')
      return
    }
    if (!Number.isFinite(cogsPct) || cogsPct < 0 || cogsPct > 100) {
      toast.error('COGS % must be between 0 and 100')
      return
    }
    if (!Number.isFinite(opex) || opex < 0) {
      toast.error('Invalid opex amount')
      return
    }
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/dtc/finance-layer?days=${periodDays}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          b2bOutstandingGhs: b2b,
          cogsPctOfRevenue: cogsPct / 100,
          fixedOpexPeriodGhs: opex,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Save failed')
      const json = (await res.json()) as FinancePayload
      setData(json)
      toast.success('Settings saved')
      setSettingsOpen(false)
    } catch {
      toast.error('Could not save settings')
    } finally {
      setSavingSettings(false)
    }
  }

  async function submitCash(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(cashForm.amountGhs)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Enter a valid amount')
      return
    }
    setCashSaving(true)
    try {
      const [y, m, d] = cashForm.collectedAt.split('-').map(Number)
      const collectedAt = new Date(y, m - 1, d, 12, 0, 0).toISOString()
      const res = await fetch('/api/dtc/b2b-collections', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountGhs: amt,
          collectedAt,
          note: cashForm.note.trim() || undefined,
        }),
      })
      if (res.status === 401) {
        toast.error('Session expired. Sign in again.')
        return
      }
      if (!res.ok) throw new Error('Failed')
      toast.success('B2B cash collection logged')
      setCashOpen(false)
      setCashForm({
        amountGhs: '',
        collectedAt: new Date().toISOString().slice(0, 10),
        note: '',
      })
      void load()
    } catch {
      toast.error('Could not log collection')
    } finally {
      setCashSaving(false)
    }
  }

  function exportCsv() {
    if (!data) return
    const lines = [
      ['metric', 'value'].join(','),
      ['periodDays', data.periodDays].join(','),
      ['dtcRevenue', data.dtcRevenue].join(','),
      ['b2bCollected', data.b2bCollected].join(','),
      ['totalRevenue', data.totalRevenue].join(','),
      ['grossProfit', data.grossProfit].join(','),
      ['netProfit', data.netProfit].join(','),
      ['b2bOutstanding', data.b2bOutstandingGhs].join(','),
      ['marketingSpend', data.marketingSpendGhs].join(','),
      '',
      ['paymentMethod', 'orders', 'revenue'].join(','),
      ...data.paymentSplit.map((p) =>
        [p.method, p.orders, p.revenue].join(','),
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-layer-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Download started')
  }

  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Finance Layer"
        description="DTC revenue excludes B2B portal orders. B2B collected = B2B portal order revenue (period) + logged trade cash. Gross profit uses COGS % of revenue; net profit subtracts prorated marketing spend and fixed opex for the period."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="fin-period" className="sr-only">
                Period
              </Label>
              <Select
                value={String(periodDays)}
                onValueChange={(v) => setPeriodDays(Number(v))}
              >
                <SelectTrigger id="fin-period" className="h-9 w-[140px]">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      Last {d} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || !data}
              onClick={exportCsv}
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={() => setCashOpen(true)}
            >
              <Banknote className="h-4 w-4" />
              Log B2B cash
            </Button>
            <Button size="sm" className="gap-1.5" type="button" onClick={openSettings}>
              <Settings2 className="h-4 w-4" />
              Assumptions
            </Button>
          </div>
        }
      />

      <div className="flex-1 space-y-6 p-4 sm:p-6">
        {data && !loading ? (
          <p className="text-xs text-muted-foreground">
            Window: {format(new Date(data.periodStart), 'd MMM yyyy')} –{' '}
            {format(new Date(data.periodEnd), 'd MMM yyyy')}
          </p>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <MetricCard
                title="DTC revenue"
                value={formatGhs(data.dtcRevenue)}
                subtitle="Orders: Web, Instagram, TikTok, Other"
                icon={TrendingUp}
              />
              <MetricCard
                title="B2B collected"
                value={formatGhs(data.b2bInvoicePaidGhs ?? 0)}
                subtitle="Sum of paid across invoices"
                icon={Wallet}
              />
              <MetricCard
                title="Total revenue"
                value={formatGhs(data.totalRevenue)}
                subtitle="DTC + B2B collected"
                icon={PiggyBank}
              />
              <MetricCard
                title="Gross profit"
                value={formatGhs(data.grossProfit)}
                subtitle={`After COGS ${(data.cogsPctOfRevenue * 100).toFixed(1)}% (${formatGhs(data.cogsGhs)})`}
                icon={TrendingUp}
                accent="positive"
              />
              <MetricCard
                title="Net profit"
                value={formatGhs(data.netProfit)}
                subtitle={`Mktg ${formatGhs(data.marketingSpendGhs)} · Opex ${formatGhs(data.fixedOpexPeriodGhs)}`}
                icon={data.netProfit >= 0 ? TrendingUp : TrendingDown}
                accent={data.netProfit >= 0 ? 'positive' : 'negative'}
              />
              <MetricCard
                title="B2B outstanding"
                value={formatGhs(data.b2bOutstandingGhs)}
                subtitle="Trade receivables (manual)"
                icon={Wallet}
              />
              <MetricCard
                title="Marketing spend"
                value={formatGhs(data.marketingSpendGhs)}
                subtitle="Campaigns prorated to window"
                icon={TrendingDown}
              />
            </div>

            <Card className="p-0">
              <div className="border-b border-border px-4 py-3 sm:px-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide">
                  Payment split (orders & revenue)
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Order count and revenue by payment method (all channels, including B2B portal).
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment method</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Share of revenue
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const orderRevenueTotal = data.paymentSplit.reduce(
                      (s, p) => s + p.revenue,
                      0,
                    )
                    return data.paymentSplit
                    .filter((p) => p.orders > 0 || p.revenue > 0)
                    .map((p) => {
                      const share =
                        orderRevenueTotal > 0
                          ? (p.revenue / orderRevenueTotal) * 100
                          : 0
                      return (
                        <TableRow key={p.method}>
                          <TableCell className="font-medium">{p.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.orders.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatGhs(p.revenue)}
                          </TableCell>
                          <TableCell className="hidden text-right text-muted-foreground tabular-nums md:table-cell">
                            {orderRevenueTotal > 0 ? `${share.toFixed(1)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  })()}
                  {data.paymentSplit.every((p) => p.orders === 0 && p.revenue === 0) ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No orders in this period.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No data.</p>
        )}
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={saveSettings}>
            <DialogHeader>
              <DialogTitle>Finance assumptions</DialogTitle>
              <DialogDescription>
                COGS is a percent of total revenue. Fixed opex is the amount attributed to this
                same reporting window. B2B outstanding is a manual AR balance.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="b2b-out">B2B outstanding (GHS)</Label>
                <Input
                  id="b2b-out"
                  inputMode="decimal"
                  value={settingsForm.b2bOutstandingGhs}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, b2bOutstandingGhs: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cogs-pct">COGS (% of revenue)</Label>
                <Input
                  id="cogs-pct"
                  inputMode="decimal"
                  value={settingsForm.cogsPercent}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, cogsPercent: e.target.value }))
                  }
                  placeholder="42"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opex">Fixed opex — period (GHS)</Label>
                <Input
                  id="opex"
                  inputMode="decimal"
                  value={settingsForm.fixedOpexPeriodGhs}
                  onChange={(e) =>
                    setSettingsForm((s) => ({ ...s, fixedOpexPeriodGhs: e.target.value }))
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettingsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingSettings}>
                {savingSettings ? (
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

      <Dialog open={cashOpen} onOpenChange={setCashOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitCash}>
            <DialogHeader>
              <DialogTitle>Log B2B cash collection</DialogTitle>
              <DialogDescription>
                Trade collections not already captured as DTC orders (e.g. invoice payments,
                wholesale drops).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="cash-amt">Amount (GHS)</Label>
                <Input
                  id="cash-amt"
                  inputMode="decimal"
                  value={cashForm.amountGhs}
                  onChange={(e) =>
                    setCashForm((c) => ({ ...c, amountGhs: e.target.value }))
                  }
                  placeholder="12000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cash-date">Collected on</Label>
                <Input
                  id="cash-date"
                  type="date"
                  value={cashForm.collectedAt}
                  onChange={(e) =>
                    setCashForm((c) => ({ ...c, collectedAt: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cash-note">Note (optional)</Label>
                <Input
                  id="cash-note"
                  value={cashForm.note}
                  onChange={(e) =>
                    setCashForm((c) => ({ ...c, note: e.target.value }))
                  }
                  placeholder="Invoice INV-2026-014"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCashOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={cashSaving}>
                {cashSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  'Log collection'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
