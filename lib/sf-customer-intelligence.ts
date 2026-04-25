import type { Db } from 'mongodb'
import { subDays } from 'date-fns'
import { SF_B2B_INVOICES_COLLECTION } from '@/lib/sf-b2b-invoices'

export type RetailCustomerSegment = 'High value' | 'At risk' | 'New (30d)' | 'Core'

export type RetailCustomerRow = {
  outletName: string
  invoices: number
  invoicedNetGhs: number
  paidGhs: number
  balanceGhs: number
  firstInvoiceAt: string
  lastInvoiceAt: string
  segment: RetailCustomerSegment
}

function daysBetween(now: Date, then: Date) {
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

function segmentFor(now: Date, row: { invoices: number; invoicedNetGhs: number; lastAt: Date; firstAt: Date }): RetailCustomerSegment {
  const daysSinceLast = daysBetween(now, row.lastAt)
  const daysSinceFirst = daysBetween(now, row.firstAt)
  if (daysSinceLast >= 60) return 'At risk'
  if (daysSinceFirst <= 30) return 'New (30d)'
  if (row.invoicedNetGhs >= 20_000 || row.invoices >= 10) return 'High value'
  return 'Core'
}

export async function computeRetailCustomerIntelligence(
  db: Db,
  opts?: { since?: Date; until?: Date },
): Promise<{
  rows: RetailCustomerRow[]
  segments: Record<'highValue' | 'atRisk' | 'new30d' | 'core', number>
}> {
  const now = new Date()
  const since = opts?.since ?? subDays(now, 365 * 5) // default "all time", bounded for index use
  const until = opts?.until ?? now

  const agg = await db
    .collection(SF_B2B_INVOICES_COLLECTION)
    .aggregate<{
      outletName: string
      invoices: number
      invoicedNetGhs: number
      paidGhs: number
      balanceGhs: number
      firstAt: Date
      lastAt: Date
    }>([
      { $match: { createdAt: { $gte: since, $lt: until } } },
      {
        $project: {
          outletName: 1,
          createdAt: 1,
          paidGhs: { $ifNull: ['$paidGhs', 0] },
          net: {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ['$amountGhs', 0] },
                  { $ifNull: ['$discountGhs', 0] },
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: '$outletName',
          invoices: { $sum: 1 },
          invoicedNetGhs: { $sum: '$net' },
          paidGhs: { $sum: '$paidGhs' },
          firstAt: { $min: '$createdAt' },
          lastAt: { $max: '$createdAt' },
        },
      },
      {
        $project: {
          _id: 0,
          outletName: '$_id',
          invoices: 1,
          invoicedNetGhs: 1,
          paidGhs: 1,
          firstAt: 1,
          lastAt: 1,
          balanceGhs: { $max: [0, { $subtract: ['$invoicedNetGhs', '$paidGhs'] }] },
        },
      },
      { $sort: { invoicedNetGhs: -1, invoices: -1, outletName: 1 } },
      { $limit: 20_000 },
    ])
    .toArray()

  const rows: RetailCustomerRow[] = agg
    .filter((r) => typeof r.outletName === 'string' && r.outletName.trim().length > 0)
    .map((r) => {
      const seg = segmentFor(now, {
        invoices: r.invoices,
        invoicedNetGhs: r.invoicedNetGhs,
        firstAt: r.firstAt ?? new Date(0),
        lastAt: r.lastAt ?? new Date(0),
      })
      return {
        outletName: r.outletName,
        invoices: r.invoices,
        invoicedNetGhs: r.invoicedNetGhs,
        paidGhs: r.paidGhs,
        balanceGhs: r.balanceGhs,
        firstInvoiceAt: r.firstAt ? r.firstAt.toISOString() : '',
        lastInvoiceAt: r.lastAt ? r.lastAt.toISOString() : '',
        segment: seg,
      }
    })

  const segments = {
    highValue: rows.filter((r) => r.segment === 'High value').length,
    atRisk: rows.filter((r) => r.segment === 'At risk').length,
    new30d: rows.filter((r) => r.segment === 'New (30d)').length,
    core: rows.filter((r) => r.segment === 'Core').length,
  }

  return { rows, segments }
}

