import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { SF_B2B_INVOICES_COLLECTION, type SfB2bInvoiceDoc, type SfB2bInvoiceItem } from '@/lib/sf-b2b-invoices'
import { SF_ORDERS_COLLECTION, type SfOrderDoc, type SfOrderItem } from '@/lib/sf-orders'

export type SfProductPerformanceRow = {
  key: string
  name: string
  sku: string | null
  units7d: number
  revenue7d: number
  unitsPrev7d: number
  revenuePrev7d: number
  wowRevenuePercent: number | null
  isNew: boolean
}

export type SfProductPerformanceHighlights = {
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

function itemKey(item: Pick<SfOrderItem, 'sku' | 'name'>): string {
  const sku = (item.sku ?? '').trim().toLowerCase()
  const name = item.name.trim().toLowerCase()
  return `${sku}::${name}`
}

function effectiveInvoiceAt(
  doc: Pick<SfB2bInvoiceDoc, 'invoiceAt' | 'dueAt' | 'createdAt'>,
): Date | null {
  if (doc.invoiceAt instanceof Date && !Number.isNaN(doc.invoiceAt.getTime())) return doc.invoiceAt
  if (doc.dueAt instanceof Date && !Number.isNaN(doc.dueAt.getTime())) return doc.dueAt
  if (doc.createdAt instanceof Date && !Number.isNaN(doc.createdAt.getTime())) return doc.createdAt
  return null
}

/**
 * Rolls up retail sell-out: SF outlet orders + B2B invoice lines.
 * Uses the same current vs prior window semantics as DTC product performance.
 */
export async function computeSfProductPerformance(
  db: Db,
  opts?: {
    currentStart?: Date
    currentEnd?: Date
  },
): Promise<{ rows: SfProductPerformanceRow[]; highlights: SfProductPerformanceHighlights }> {
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

  function addLine(
    item: { sku?: string; name: string; qty: number; unitPriceGhs: number },
    bucketKey: 'current' | 'previous',
  ) {
    const name = String(item.name ?? '').trim()
    if (!name) return
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
    const unit = Number(item.unitPriceGhs ?? 0) || 0
    if (qty <= 0) return
    const line = qty * unit
    const b = row[bucketKey]
    b.units += qty
    b.revenue += line
  }

  const ordersCursor = db
    .collection(SF_ORDERS_COLLECTION)
    .find({ orderedAt: { $gte: prevStart, $lt: currentEnd } })
    .project({ orderedAt: 1, items: 1 })
    .batchSize(1000)

  for await (const order of ordersCursor as AsyncIterable<Pick<SfOrderDoc, 'orderedAt' | 'items'>>) {
    const isCurrent = order.orderedAt >= currentStart && order.orderedAt < currentEnd
    const bucketKey: 'current' | 'previous' = isCurrent ? 'current' : 'previous'
    for (const item of order.items ?? []) {
      addLine(
        {
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          unitPriceGhs: item.unitPriceGhs,
        },
        bucketKey,
      )
    }
  }

  const invCursor = db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .find({
      $or: [
        { invoiceAt: { $gte: prevStart, $lt: currentEnd } },
        { createdAt: { $gte: prevStart, $lt: currentEnd } },
      ],
    })
    .project({ invoiceAt: 1, dueAt: 1, createdAt: 1, items: 1 })
    .batchSize(1000)

  for await (const doc of invCursor as AsyncIterable<
    Pick<SfB2bInvoiceDoc, 'invoiceAt' | 'dueAt' | 'createdAt' | 'items'>
  >) {
    const at = effectiveInvoiceAt(doc)
    if (!at || at < prevStart || at >= currentEnd) continue
    const isCurrent = at >= currentStart && at < currentEnd
    const bucketKey: 'current' | 'previous' = isCurrent ? 'current' : 'previous'
    const items = Array.isArray(doc.items) ? doc.items : []
    for (const raw of items) {
      const it = raw as SfB2bInvoiceItem
      addLine(
        {
          sku: it.sku,
          name: it.name,
          qty: it.qty,
          unitPriceGhs: it.unitPriceGhs,
        },
        bucketKey,
      )
    }
  }

  const rows: SfProductPerformanceRow[] = []
  for (const [key, v] of agg) {
    const { current, previous } = v
    let wowRevenuePercent: number | null = null
    const isNew = current.revenue > 0 && previous.revenue === 0
    if (previous.revenue > 0) {
      wowRevenuePercent = ((current.revenue - previous.revenue) / previous.revenue) * 100
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

  let topRevenue: SfProductPerformanceHighlights['topRevenue'] = null
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

  let fastestGrowing: SfProductPerformanceHighlights['fastestGrowing'] = null
  for (const r of rows) {
    if (r.revenuePrev7d <= 0 || r.wowRevenuePercent === null) continue
    if (!fastestGrowing || r.wowRevenuePercent > fastestGrowing.wowPercent) {
      fastestGrowing = {
        name: r.name,
        sku: r.sku,
        wowPercent: r.wowRevenuePercent,
      }
    }
  }

  return { rows, highlights: { topRevenue, fastestGrowing } }
}
