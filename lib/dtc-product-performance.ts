import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { DTC_ORDERS_COLLECTION, type DtcOrderDoc, type DtcOrderItem } from '@/lib/dtc-orders'
import { DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION } from '@/lib/dtc-customer-intelligence-ledger'

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

function itemKey(item: Pick<DtcOrderItem, 'sku' | 'name'>): string {
  const sku = (item.sku ?? '').trim().toLowerCase()
  const name = item.name.trim().toLowerCase()
  return `${sku}::${name}`
}

function parseItemsOrderedFallback(s: string): Array<{ name: string; qty: number }> {
  const raw = String(s ?? '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.*?)(?:\s*x\s*(\d+))?$/i)
      const name = String(m?.[1] ?? part).trim()
      const qty = Math.max(1, Number.parseInt(String(m?.[2] ?? '1'), 10) || 1)
      return { name, qty }
    })
    .filter((it) => it.name)
}

/**
 * Rolls up DTC order line items for a current window vs the prior window.
 * The API defaults to last 7 days vs prior 7 days, but can pass custom windows.
 */
export async function computeProductPerformance(
  db: Db,
  opts?: {
    currentStart?: Date
    currentEnd?: Date
  },
): Promise<{ rows: ProductPerformanceRow[]; highlights: ProductPerformanceHighlights }> {
  const now = new Date()
  const currentEnd = opts?.currentEnd ?? now
  const currentStart = opts?.currentStart ?? subDays(currentEnd, 7)
  const windowMs = Math.max(0, currentEnd.getTime() - currentStart.getTime())
  const prevEnd = currentStart
  const prevStart = new Date(prevEnd.getTime() - windowMs)

  type Bucket = { units: number; revenue: number }
  const agg = new Map<
    string,
    { displayName: string; sku: string | null; current: Bucket; previous: Bucket }
  >()

  const seenOrderNumbers = new Set<string>()
  // IMPORTANT: Do not cap results with `.limit()` — users can have thousands of orders.
  // Stream with cursors so rollups are accurate for the full time window.

  const ledgerCursor = db
    .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
    .find({ orderedAt: { $gte: prevStart, $lt: currentEnd } })
    .project({ orderedAt: 1, orderNumber: 1, items: 1, itemsOrdered: 1, amountToCollectGhs: 1 })
    .batchSize(1000)

  for await (const order of ledgerCursor as AsyncIterable<{
    orderedAt?: Date
    orderNumber?: string
    items?: Array<{ sku?: string; name: string; qty: number; unitPrice: number }>
    itemsOrdered?: string
    amountToCollectGhs?: number
  }>) {
    const on = String(order.orderNumber ?? '').trim()
    if (on) seenOrderNumbers.add(on)
    const orderedAt =
      order.orderedAt instanceof Date
        ? order.orderedAt
        : order.orderedAt
          ? new Date(String(order.orderedAt))
          : null
    if (!orderedAt || Number.isNaN(orderedAt.getTime())) continue
    const isCurrent = orderedAt >= currentStart && orderedAt < currentEnd
    const bucketKey: 'current' | 'previous' = isCurrent ? 'current' : 'previous'

    const structuredItems = Array.isArray(order.items) && order.items.length ? order.items : null
    const fallbackItems = !structuredItems
      ? parseItemsOrderedFallback(order.itemsOrdered ?? '')
      : null
    const fallbackQtySum = (fallbackItems ?? []).reduce(
      (s, it) => s + (Number(it.qty ?? 0) || 0),
      0,
    )
    const estUnitPrice =
      fallbackItems && fallbackQtySum > 0
        ? (Number(order.amountToCollectGhs ?? 0) || 0) / fallbackQtySum
        : 0

    const itemsToUse: Array<{ sku?: string; name: string; qty: number; unitPrice: number }> =
      structuredItems ??
      (fallbackItems ?? []).map((it) => ({
        name: it.name,
        qty: it.qty,
        unitPrice: estUnitPrice,
      }))

    for (const item of itemsToUse) {
      const name = String(item.name ?? '').trim()
      if (!name) continue
      const key = itemKey({ sku: item.sku, name })
      let row = agg.get(key)
      if (!row) {
        row = {
          displayName: name,
          sku: item.sku?.trim() ? item.sku.trim() : null,
          current: { units: 0, revenue: 0 },
          previous: { units: 0, revenue: 0 },
        }
        agg.set(key, row)
      }
      const qty = Number(item.qty ?? 0) || 0
      const unitPrice = Number(item.unitPrice ?? 0) || 0
      if (qty <= 0) continue
      const line = qty * unitPrice
      const b = row[bucketKey]
      b.units += qty
      b.revenue += line
    }
  }

  const ordersCursor = db
    .collection(DTC_ORDERS_COLLECTION)
    .find({ orderedAt: { $gte: prevStart, $lt: currentEnd } })
    .project({ orderedAt: 1, items: 1, orderNumber: 1 })
    .batchSize(1000)

  for await (const order of ordersCursor as AsyncIterable<
    Pick<DtcOrderDoc, 'orderedAt' | 'items'> & { orderNumber?: string }
  >) {
    const on = String((order as any).orderNumber ?? '').trim()
    if (on && seenOrderNumbers.has(on)) continue
    const isCurrent = order.orderedAt >= currentStart && order.orderedAt < currentEnd
    const bucketKey: 'current' | 'previous' = isCurrent ? 'current' : 'previous'
    for (const item of order.items ?? []) {
      const name = item.name.trim()
      if (!name) continue
      const key = itemKey(item)
      let row = agg.get(key)
      if (!row) {
        row = {
          displayName: name,
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
