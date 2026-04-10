import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { DTC_ORDERS_COLLECTION, type DtcOrderDoc, type DtcOrderItem } from '@/lib/dtc-orders'

export type ProductPerformanceRow = {
  key: string
  name: string
  sku: string | null
  units7d: number
  revenue7d: number
  unitsPrev7d: number
  revenuePrev7d: number
  /** WoW revenue change; null when prior-period revenue was 0. */
  wowRevenuePercent: number | null
  /** Sold in the last 7d but not in the 7d before that. */
  isNew: boolean
}

export type ProductPerformanceHighlights = {
  topRevenue: {
    name: string
    sku: string | null
    revenue: number
    units: number
  } | null
  fastestGrowing: {
    name: string
    sku: string | null
    wowPercent: number
  } | null
}

function itemKey(item: DtcOrderItem): string {
  const sku = (item.sku ?? '').trim().toLowerCase()
  const name = item.name.trim().toLowerCase()
  return `${sku}::${name}`
}

/**
 * Rolls up DTC order line items for the last 7 calendar days vs the prior 7 days
 * (rolling windows from now).
 */
export async function computeProductPerformance(
  db: Db,
): Promise<{ rows: ProductPerformanceRow[]; highlights: ProductPerformanceHighlights }> {
  const now = new Date()
  const currentStart = subDays(now, 7)
  const prevStart = subDays(now, 14)

  const orders = (await db
    .collection(DTC_ORDERS_COLLECTION)
    .find({ orderedAt: { $gte: prevStart } })
    .project({ orderedAt: 1, items: 1 })
    .limit(5000)
    .toArray()) as Pick<DtcOrderDoc, 'orderedAt' | 'items'>[]

  type Bucket = { units: number; revenue: number }
  const agg = new Map<
    string,
    { displayName: string; sku: string | null; current: Bucket; previous: Bucket }
  >()

  for (const order of orders) {
    const isCurrent = order.orderedAt >= currentStart
    const bucketKey: 'current' | 'previous' = isCurrent ? 'current' : 'previous'
    for (const item of order.items ?? []) {
      const key = itemKey(item)
      let row = agg.get(key)
      if (!row) {
        row = {
          displayName: item.name.trim(),
          sku: item.sku?.trim() ? item.sku.trim() : null,
          current: { units: 0, revenue: 0 },
          previous: { units: 0, revenue: 0 },
        }
        agg.set(key, row)
      }
      const line = item.qty * item.unitPrice
      const b = row[bucketKey]
      b.units += item.qty
      b.revenue += line
    }
  }

  const rows: ProductPerformanceRow[] = []
  for (const [key, v] of agg) {
    const { current, previous } = v
    let wowRevenuePercent: number | null = null
    const isNew = current.revenue > 0 && previous.revenue === 0
    if (previous.revenue > 0) {
      wowRevenuePercent =
        ((current.revenue - previous.revenue) / previous.revenue) * 100
    }
    rows.push({
      key,
      name: v.displayName,
      sku: v.sku,
      units7d: current.units,
      revenue7d: current.revenue,
      unitsPrev7d: previous.units,
      revenuePrev7d: previous.revenue,
      wowRevenuePercent,
      isNew,
    })
  }

  rows.sort((a, b) => b.revenue7d - a.revenue7d)

  let topRevenue: ProductPerformanceHighlights['topRevenue'] = null
  for (const r of rows) {
    if (r.revenue7d <= 0) continue
    if (!topRevenue || r.revenue7d > topRevenue.revenue) {
      topRevenue = {
        name: r.name,
        sku: r.sku,
        revenue: r.revenue7d,
        units: r.units7d,
      }
    }
  }

  let fastestGrowing: ProductPerformanceHighlights['fastestGrowing'] = null
  for (const r of rows) {
    if (r.revenuePrev7d <= 0 || r.wowRevenuePercent === null) continue
    if (
      !fastestGrowing ||
      r.wowRevenuePercent > fastestGrowing.wowPercent
    ) {
      fastestGrowing = {
        name: r.name,
        sku: r.sku,
        wowPercent: r.wowRevenuePercent,
      }
    }
  }

  return { rows, highlights: { topRevenue, fastestGrowing } }
}
