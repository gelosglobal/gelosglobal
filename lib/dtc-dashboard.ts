import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { DTC_ORDERS_COLLECTION } from '@/lib/dtc-orders'
import { DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION } from '@/lib/dtc-customer-intelligence-ledger'
import { computeInventoryStats, computeStockHealth, listDtcInventory } from '@/lib/dtc-inventory'
import { computeFinanceLayerSnapshot } from '@/lib/dtc-finance'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'

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
  const since = periodDays <= 0 ? new Date(0) : subDays(now, periodDays)

  const dateCoerceStages = [
    {
      $addFields: {
        orderedAtDate: {
          $convert: { input: '$orderedAt', to: 'date', onError: null, onNull: null },
        },
      },
    },
    { $match: { orderedAtDate: { $gte: since, $lte: now } } },
  ] as const

  const [
    inventory,
    finance,
    topSkuAgg,
    allTimeKpis,
    allTimeCount,
    allTimeRevenueSum,
    customerIntelTotals,
    customerIntelLedgerCount,
  ] = await Promise.all([
    listDtcInventory(db),
    computeFinanceLayerSnapshot(db, periodDays),
    db
      .collection(DTC_ORDERS_COLLECTION)
      .aggregate<{ sku: string; name: string; units: number; revenueGhs: number }>([
        ...dateCoerceStages,
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
    db
      .collection(DTC_ORDERS_COLLECTION)
      .aggregate<{
        orders: number
        units: number
        revenueGhs: number
        awaitingFulfillment: number
      }>([
        // Use item-based math so revenue works even if `totalAmount` is missing/0/incorrect.
        { $project: { status: 1, totalAmount: 1, items: { $ifNull: ['$items', []] } } },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            status: { $ifNull: ['$status', '' ] },
            totalAmount: {
              $convert: { input: '$totalAmount', to: 'double', onError: 0, onNull: 0 },
            },
            qty: { $convert: { input: '$items.qty', to: 'double', onError: 0, onNull: 0 } },
            unitPrice: {
              $convert: { input: '$items.unitPrice', to: 'double', onError: 0, onNull: 0 },
            },
          },
        },
        {
          // Collapse back to one row per order so we don't double-count after unwind.
          $group: {
            _id: '$_id',
            status: { $first: '$status' },
            totalAmount: { $first: '$totalAmount' },
            units: { $sum: '$qty' },
            revenueFromItems: { $sum: { $multiply: ['$qty', '$unitPrice'] } },
          },
        },
        {
          $group: {
            _id: null,
            orders: { $sum: 1 },
            revenueGhs: {
              $sum: {
                $cond: [
                  { $gt: ['$totalAmount', 0] },
                  '$totalAmount',
                  '$revenueFromItems',
                ],
              },
            },
            units: { $sum: '$units' },
            awaitingFulfillment: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['processing', 'pending_payment']] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $project: { _id: 0, orders: 1, units: 1, revenueGhs: 1, awaitingFulfillment: 1 } },
      ])
      .toArray(),
    db.collection(DTC_ORDERS_COLLECTION).countDocuments({}),
    db
      .collection(DTC_ORDERS_COLLECTION)
      .aggregate<{ revenueGhs: number }>([
        {
          $project: {
            totalAmount: {
              $convert: { input: '$totalAmount', to: 'double', onError: 0, onNull: 0 },
            },
          },
        },
        { $group: { _id: null, revenueGhs: { $sum: '$totalAmount' } } },
        { $project: { _id: 0, revenueGhs: 1 } },
      ])
      .toArray(),
    db
      .collection(DTC_CUSTOMERS_COLLECTION)
      .aggregate<{ totalOrders: number; totalCollectedGhs: number }>([
        { $match: { customer: { $type: 'string', $ne: '' } } },
        {
          $lookup: {
            from: DTC_ORDERS_COLLECTION,
            localField: 'customer',
            foreignField: 'customer',
            as: 'orders',
          },
        },
        {
          $addFields: {
            aggOrderCount: { $size: '$orders' },
          },
        },
        {
          $project: {
            _id: 0,
            // Match `/api/dtc/customers` logic:
            // - totalOrders: null => 0, defined => value, undefined => aggOrderCount
            // - totalCollected: null => 0, defined => value, undefined => 0
            totalOrders: {
              $cond: [
                { $eq: ['$importTotalOrders', null] },
                0,
                {
                  $cond: [
                    { $ne: [{ $type: '$importTotalOrders' }, 'missing'] },
                    { $toDouble: '$importTotalOrders' },
                    { $toDouble: '$aggOrderCount' },
                  ],
                },
              ],
            },
            totalCollectedGhs: {
              $cond: [
                { $eq: ['$importTotalCollectedGhs', null] },
                0,
                {
                  $cond: [
                    { $ne: [{ $type: '$importTotalCollectedGhs' }, 'missing'] },
                    { $toDouble: '$importTotalCollectedGhs' },
                    0,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: '$totalOrders' },
            totalCollectedGhs: { $sum: '$totalCollectedGhs' },
          },
        },
        { $project: { _id: 0, totalOrders: 1, totalCollectedGhs: 1 } },
      ])
      .toArray(),
    db.collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION).countDocuments({}),
  ])

  const invStats = computeInventoryStats(inventory)
  const base = allTimeKpis?.[0] ?? {
    orders: 0,
    units: 0,
    revenueGhs: 0,
    awaitingFulfillment: 0,
  }
  const sumTotalAmount = allTimeRevenueSum?.[0]?.revenueGhs ?? 0
  const k = {
    ...base,
    orders: Math.max(base.orders, allTimeCount ?? 0),
    revenueGhs: Math.max(base.revenueGhs, sumTotalAmount),
  }
  const intel = customerIntelTotals?.[0]
  // Customer Intelligence "Total orders" is defined as the number of ledger rows (each row = 1 order).
  const intelOrders = customerIntelLedgerCount ?? 0
  const intelCollected = intel?.totalCollectedGhs ?? 0
  const avgOrderValueGhs = k.orders === 0 ? 0 : k.revenueGhs / k.orders

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

  if (k.awaitingFulfillment > 0) {
    alerts.push({
      id: 'orders-awaiting-fulfillment',
      severity: k.awaitingFulfillment >= 10 ? 'high' : 'medium',
      text: `[Orders] ${k.awaitingFulfillment.toLocaleString()} orders awaiting fulfillment`,
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
      // Dashboard should reflect imported Customer Intelligence plus newly created Orders Engine orders.
      // Customer Intelligence is imported into `dtc_customers` (intelOrders/intelCollected), while new orders
      // live in `dtc_orders` (k.orders/k.revenueGhs).
      orders: intelOrders + (k.orders ?? 0),
      units: k.units,
      revenueGhs: intelCollected + (k.revenueGhs ?? 0),
      avgOrderValueGhs:
        intelOrders + (k.orders ?? 0) === 0
          ? 0
          : (intelCollected + (k.revenueGhs ?? 0)) / (intelOrders + (k.orders ?? 0)),
      awaitingFulfillment: k.awaitingFulfillment,
      skusTracked: invStats.skusTracked,
      belowSafety: invStats.belowSafety,
    },
    topSkus: topSkuAgg,
    alerts: alerts.slice(0, 25),
  }
}

