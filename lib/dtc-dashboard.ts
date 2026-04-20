import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { DTC_ORDERS_COLLECTION } from '@/lib/dtc-orders'
import { computeInventoryStats, listDtcInventory } from '@/lib/dtc-inventory'
import { computeFinanceLayerSnapshot } from '@/lib/dtc-finance'

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
  }
}

