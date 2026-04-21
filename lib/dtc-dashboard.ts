import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { DTC_ORDERS_COLLECTION } from '@/lib/dtc-orders'
import { computeInventoryStats, computeStockHealth, listDtcInventory } from '@/lib/dtc-inventory'
import { computeFinanceLayerSnapshot } from '@/lib/dtc-finance'

export type DtcDashboardAlert = {
  id: string
  severity: 'high' | 'medium'
  text: string
}

export type DtcDashboardSnapshot = {
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
  alerts: DtcDashboardAlert[]
}

export async function computeDtcDashboardSnapshot(
  db: Db,
  periodDays = 7,
): Promise<DtcDashboardSnapshot> {
  const now = new Date()
  const since = subDays(now, periodDays)

  const [inventory, finance, topSkuAgg] = await Promise.all([
    listDtcInventory(db),
    computeFinanceLayerSnapshot(db, periodDays),
    db
      .collection(DTC_ORDERS_COLLECTION)
      .aggregate<{ sku: string; name: string; units: number; revenueGhs: number }>([
        { $match: { orderedAt: { $gte: since, $lte: now } } },
        { $unwind: '$items' },
        {
          $project: {
            sku: {
              $cond: [
                { $eq: [{ $type: '$items.sku' }, 'string'] },
                { $toUpper: '$items.sku' },
                'UNKNOWN',
              ],
            },
            name: { $ifNull: ['$items.name', 'Unknown'] },
            qty: { $ifNull: ['$items.qty', 0] },
            unitPrice: { $ifNull: ['$items.unitPrice', 0] },
          },
        },
        {
          $group: {
            _id: '$sku',
            name: { $first: '$name' },
            units: { $sum: '$qty' },
            revenueGhs: { $sum: { $multiply: ['$qty', '$unitPrice'] } },
          },
        },
        { $sort: { units: -1 } },
        { $limit: 8 },
        {
          $project: {
            _id: 0,
            sku: '$_id',
            name: 1,
            units: 1,
            revenueGhs: 1,
          },
        },
      ])
      .toArray(),
  ])

  const invStats = computeInventoryStats(inventory)
  const orders = (await db
    .collection(DTC_ORDERS_COLLECTION)
    .find({ orderedAt: { $gte: since, $lte: now } })
    .project({ totalAmount: 1, status: 1, items: 1 })
    .limit(20000)
    .toArray()) as Array<{
    totalAmount: number
    status: string
    items: Array<{ qty: number }>
  }>

  let units = 0
  let awaitingFulfillment = 0
  for (const o of orders) {
    if (o.status === 'processing' || o.status === 'pending_payment') {
      awaitingFulfillment += 1
    }
    for (const it of o.items ?? []) {
      units += Number(it.qty) || 0
    }
  }

  const revenueGhs = finance.snapshot.dtcRevenue
  const avgOrderValueGhs = orders.length === 0 ? 0 : revenueGhs / orders.length

  const alerts: DtcDashboardAlert[] = []

  let invAlerts = 0
  for (const row of inventory) {
    if (invAlerts >= 10) break
    const h = computeStockHealth(row.onHand, row.safetyStock)
    if (h === 'critical' || h === 'low') {
      invAlerts += 1
      alerts.push({
        id: `inv-${row._id.toHexString()}`,
        severity: h === 'critical' ? 'high' : 'medium',
        text: `[Stock] ${row.warehouse}: ${row.name} (${row.sku}) — ${row.onHand} on hand vs ${row.safetyStock} safety`,
      })
    }
  }

  if (awaitingFulfillment > 0) {
    alerts.push({
      id: 'orders-awaiting-fulfillment',
      severity: awaitingFulfillment >= 10 ? 'high' : 'medium',
      text: `[Orders] ${awaitingFulfillment.toLocaleString()} orders awaiting fulfillment`,
    })
  }

  if (finance.snapshot.b2bOutstandingGhs >= 5_000) {
    alerts.push({
      id: 'fin-b2b-outstanding',
      severity: finance.snapshot.b2bOutstandingGhs >= 20_000 ? 'high' : 'medium',
      text: `[B2B] Outstanding receivables: GHS ${finance.snapshot.b2bOutstandingGhs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    })
  }

  return {
    generatedAt: now.toISOString(),
    periodDays,
    periodStart: since.toISOString(),
    periodEnd: now.toISOString(),
    kpis: {
      orders: orders.length,
      units,
      revenueGhs,
      avgOrderValueGhs,
      awaitingFulfillment,
      skusTracked: invStats.skusTracked,
      belowSafety: invStats.belowSafety,
    },
    topSkus: topSkuAgg,
    alerts: alerts.slice(0, 25),
  }
}

