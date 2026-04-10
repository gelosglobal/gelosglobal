import { DtcPageHeader } from '@/components/dtc/dtc-page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowUpRight, Download, Filter } from 'lucide-react'

const orders = [
  {
    id: 'DTC-10492',
    customer: 'Elite Pharmacy',
    channel: 'Web',
    total: 'GHS 284.00',
    status: 'fulfilled' as const,
    placed: 'Today, 09:14',
  },
  {
    id: 'DTC-10491',
    customer: 'Ama K. (guest)',
    channel: 'Instagram',
    total: 'GHS 156.50',
    status: 'processing' as const,
    placed: 'Today, 08:02',
  },
  {
    id: 'DTC-10488',
    customer: 'Kwame Supermarket',
    channel: 'B2B portal',
    total: 'GHS 1,120.00',
    status: 'pending_payment' as const,
    placed: 'Yesterday',
  },
  {
    id: 'DTC-10480',
    customer: 'Marina Stores',
    channel: 'Web',
    total: 'GHS 92.00',
    status: 'fulfilled' as const,
    placed: 'Yesterday',
  },
]

function orderStatusBadge(status: (typeof orders)[number]['status']) {
  switch (status) {
    case 'fulfilled':
      return <Badge className="bg-emerald-600 hover:bg-emerald-600">Fulfilled</Badge>
    case 'processing':
      return <Badge variant="secondary">Processing</Badge>
    case 'pending_payment':
      return <Badge variant="outline">Pending payment</Badge>
    default:
      return null
  }
}

export function OrdersEngineView() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Orders Engine"
        description="Monitor direct-to-consumer orders across web, social, and partner checkout. Track fulfillment and payment status in one place."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-l-4 border-l-violet-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Orders today
            </p>
            <p className="mt-2 text-3xl font-bold">47</p>
            <p className="mt-1 text-xs text-muted-foreground">+12% vs last week</p>
          </Card>
          <Card className="border-l-4 border-l-blue-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Avg order value
            </p>
            <p className="mt-2 text-3xl font-bold">GHS 198</p>
            <p className="mt-1 text-xs text-muted-foreground">Blended DTC</p>
          </Card>
          <Card className="border-l-4 border-l-amber-600 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Awaiting fulfillment
            </p>
            <p className="mt-2 text-3xl font-bold">6</p>
            <p className="mt-1 text-xs text-muted-foreground">SLA &lt; 24h</p>
          </Card>
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Recent orders
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Channel</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Placed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs font-medium">{o.id}</TableCell>
                  <TableCell>{o.customer}</TableCell>
                  <TableCell className="hidden sm:table-cell">{o.channel}</TableCell>
                  <TableCell className="font-medium">{o.total}</TableCell>
                  <TableCell>{orderStatusBadge(o.status)}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {o.placed}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

const segments = [
  { name: 'High LTV', count: '1,240', note: '3+ orders, 90d' },
  { name: 'At risk', count: '312', note: 'No order 60d+' },
  { name: 'New (30d)', count: '589', note: 'First purchase window' },
  { name: 'Subscribers', count: '892', note: 'Active refill plan' },
]

const customers = [
  { name: 'Ama Osei', email: 'ama.o@email.com', orders: 14, ltv: 'GHS 2,840', tier: 'Gold' },
  { name: 'Kwame Boateng', email: 'k.boateng@email.com', orders: 6, ltv: 'GHS 980', tier: 'Silver' },
  { name: 'Yaa Mensah', email: 'y.mensah@email.com', orders: 22, ltv: 'GHS 4,120', tier: 'Gold' },
  { name: 'Kofi Annan Jr.', email: 'k.annan@email.com', orders: 2, ltv: 'GHS 210', tier: 'Bronze' },
]

export function CustomerIntelligenceView() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Customer Intelligence"
        description="Segment DTC buyers, compare lifetime value, and spot churn risk before sell-out momentum drops."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-4 w-4" />
            Export segments
          </Button>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {segments.map((s) => (
            <Card key={s.name} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {s.name}
              </p>
              <p className="mt-2 text-2xl font-bold">{s.count}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.note}</p>
            </Card>
          ))}
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Top customers</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>LTV</TableHead>
                <TableHead>Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.email}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {c.email}
                  </TableCell>
                  <TableCell>{c.orders}</TableCell>
                  <TableCell className="font-medium">{c.ltv}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.tier}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

const skus = [
  { sku: 'GLO-CHAR-100', name: 'Charcoal toothpaste', onHand: 240, daysCover: 28, status: 'ok' as const },
  { sku: 'GLO-FLOSS-01', name: 'Flosser refill', onHand: 19, daysCover: 12, status: 'low' as const },
  { sku: 'GLO-WHITE-KIT', name: 'Whitening kit', onHand: 11, daysCover: 9, status: 'critical' as const },
  { sku: 'GLO-MW-250', name: 'Mouthwash 250ml', onHand: 156, daysCover: 45, status: 'ok' as const },
]

function stockBadge(s: (typeof skus)[number]['status']) {
  if (s === 'ok') return <Badge className="bg-emerald-600 hover:bg-emerald-600">Healthy</Badge>
  if (s === 'low') return <Badge variant="secondary">Low</Badge>
  return <Badge variant="destructive">Critical</Badge>
}

export function DtcInventoryView() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="DTC Inventory"
        description="Sell-out stock levels for web and fulfilment centres. Days of cover helps prioritise replenishment."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-4 w-4" />
            Warehouse
          </Button>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">SKUs tracked</p>
            <p className="mt-2 text-3xl font-bold">128</p>
          </Card>
          <Card className="border-l-4 border-l-amber-600 p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Below safety</p>
            <p className="mt-2 text-3xl font-bold">7</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">In transit</p>
            <p className="mt-2 text-3xl font-bold">GHS 42k</p>
            <p className="mt-1 text-xs text-muted-foreground">PO value</p>
          </Card>
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Stock positions</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Days cover</TableHead>
                <TableHead>Health</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skus.map((row) => (
                <TableRow key={row.sku}>
                  <TableCell className="font-mono text-xs font-medium">{row.sku}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell className="text-right">{row.onHand}</TableCell>
                  <TableCell className="hidden text-right sm:table-cell">{row.daysCover}d</TableCell>
                  <TableCell>{stockBadge(row.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

const products = [
  { name: 'Charcoal toothpaste', units: 1840, revenue: 'GHS 18,400', wow: 4.2 },
  { name: 'Whitening kit', units: 420, revenue: 'GHS 12,600', wow: -1.1 },
  { name: 'Flosser refill', units: 2100, revenue: 'GHS 6,300', wow: 8.4 },
  { name: 'Mouthwash 250ml', units: 980, revenue: 'GHS 4,900', wow: 0.6 },
]

export function ProductPerformanceView() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Product Performance"
        description="SKU-level sell-out velocity, revenue, and week-over-week trends for DTC assortment planning."
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Top SKU revenue (7d)</p>
            <p className="mt-2 text-3xl font-bold">Charcoal toothpaste</p>
            <p className="mt-1 text-sm text-muted-foreground">GHS 18.4k · 1,840 units</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Fastest growing</p>
            <p className="mt-2 text-3xl font-bold">Flosser refill</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-emerald-600">
              <ArrowUpRight className="h-4 w-4" />
              +8.4% vs prior week
            </p>
          </Card>
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Assortment snapshot</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Units (7d)</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="hidden text-right md:table-cell">WoW</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{p.units.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-medium">{p.revenue}</TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <span
                      className={
                        p.wow >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }
                    >
                      {p.wow >= 0 ? '+' : ''}
                      {p.wow}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}

const settlements = [
  { id: 'STL-APR-01', period: '1–7 Apr 2026', amount: 'GHS 24,180', status: 'paid' as const },
  { id: 'STL-MAR-04', period: '24–31 Mar 2026', amount: 'GHS 18,920', status: 'paid' as const },
  { id: 'STL-MAR-03', period: '17–23 Mar 2026', amount: 'GHS 21,400', status: 'pending' as const },
]

export function FinanceLayerView() {
  return (
    <div className="flex min-h-0 flex-col">
      <DtcPageHeader
        title="Finance Layer"
        description="DTC settlements, gateway fees, and payout timing. Align sell-out revenue with finance close."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-4 w-4" />
            Statement
          </Button>
        }
      />
      <div className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Pending payout</p>
            <p className="mt-2 text-3xl font-bold">GHS 21.4k</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Fees (MTD)</p>
            <p className="mt-2 text-3xl font-bold">GHS 612</p>
            <p className="mt-1 text-xs text-muted-foreground">Blended 2.1%</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium uppercase text-muted-foreground">Net DTC (30d)</p>
            <p className="mt-2 text-3xl font-bold">GHS 186k</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
              <ArrowUpRight className="h-3.5 w-3.5" />
              vs prior 30d
            </p>
          </Card>
        </div>
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Settlement runs</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs font-medium">{s.id}</TableCell>
                  <TableCell>{s.period}</TableCell>
                  <TableCell className="text-right font-medium">{s.amount}</TableCell>
                  <TableCell>
                    {s.status === 'paid' ? (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">Paid</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  )
}
