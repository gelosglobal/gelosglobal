import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION,
  dtcCustomerIntelLedgerPhoneKey,
} from '@/lib/dtc-customer-intelligence-ledger'
import { DTC_ORDERS_COLLECTION, formatGhs } from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

type CustomerAgg = {
  customer: string
  orders: number
  ltv: number
  firstOrderAt: Date
  lastOrderAt: Date
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24))
}

function segmentFor(row: CustomerAgg): 'High LTV' | 'At risk' | 'New (30d)' | 'Core' {
  const now = new Date()
  const daysSinceLast = daysBetween(now, row.lastOrderAt)
  const daysSinceFirst = daysBetween(now, row.firstOrderAt)

  if (daysSinceLast >= 60) return 'At risk'
  if (daysSinceFirst <= 30) return 'New (30d)'
  if (row.ltv >= 2000 || row.orders >= 10) return 'High LTV'
  return 'Core'
}

function fmtDateYmd(d: Date) {
  if (d.getTime() === 0 || Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Aligns with Customer Intelligence “unique by phone” (fallback to name when phone blank). */
function customerListDedupeKey(customerName: string, phoneDisplay: string) {
  return `${String(customerName ?? '').trim().toLowerCase()}|${dtcCustomerIntelLedgerPhoneKey(phoneDisplay)}`
}

function syntheticCustomerId(source: 'ord' | 'led', customerName: string, phoneRaw: string) {
  const h = createHash('sha256').update(`${source}\n${customerName}\n${phoneRaw}`).digest('hex')
  return `${source === 'ord' ? 'order' : 'ledger'}-customer:${h.slice(0, 24)}`
}

const createCustomerSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(40).optional(),
  email: z.string().trim().email().optional(),
  location: z.string().trim().min(1).max(200).optional(),
  source: z.enum(['walk_in', 'instagram', 'web', 'referral', 'sales_rep', 'other']).optional(),
  joinDate: z
    .union([z.string().datetime(), z.string().min(1)])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), {
      message: 'Invalid joinDate',
    }),
  segment: z.enum(['High LTV', 'At risk', 'New (30d)', 'Core']).optional(),
  totalOrders: z.coerce.number().int().min(0).max(10_000_000).optional(),
  totalBilledGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  totalCollectedGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  returnedType: z.enum(['count', 'ghs']).optional(),
  returned: z.coerce.number().min(0).max(1_000_000_000).optional(),
  firstOrderDate: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .optional()
    .transform((v) => (v ? new Date(`${v}T12:00:00.000Z`) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), { message: 'Invalid firstOrderDate' }),
  lastOrderDate: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .optional()
    .transform((v) => (v ? new Date(`${v}T12:00:00.000Z`) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), { message: 'Invalid lastOrderDate' }),
})

export async function GET() {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { db } = getMongo()
  // Start from explicit customers so “Add customer” shows up even with 0 orders.
  // Then left-join orders (by customer name) to compute LTV, orders, and recency.
  const rows = (await db
    .collection(DTC_CUSTOMERS_COLLECTION)
    .aggregate<CustomerAgg>([
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
          aggLtv: { $sum: '$orders.totalAmount' },
          aggFirstOrderedAt: { $min: '$orders.orderedAt' },
          aggLastOrderedAt: { $max: '$orders.orderedAt' },
        },
      },
      {
        $project: {
          _id: 1,
          customer: 1,
          phone: 1,
          email: 1,
          location: 1,
          source: 1,
          joinDate: 1,
          segment: 1,
          importRowIndex: 1,
          importTotalOrders: 1,
          importTotalBilledGhs: 1,
          importTotalCollectedGhs: 1,
          importReturnedGhs: 1,
          importReturnedCount: 1,
          importFirstOrderAt: 1,
          importLastOrderAt: 1,
          aggOrderCount: 1,
          aggLtv: 1,
          aggFirstOrderedAt: 1,
          aggLastOrderedAt: 1,
        },
      },
      { $sort: { aggLtv: -1, aggOrderCount: -1, customer: 1, _id: 1 } },
      { $limit: 15_000 },
    ])
    .toArray()) as CustomerAgg[]

  const customers = rows.map((r) => {
    const x = r as any
    const aggOrders = Number(x.aggOrderCount ?? 0)
    const aggLtv = Number(x.aggLtv ?? 0)
    const aggFirst = x.aggFirstOrderedAt ? new Date(x.aggFirstOrderedAt) : null
    const aggLast = x.aggLastOrderedAt ? new Date(x.aggLastOrderedAt) : null

    /**
     * After `replaceIntelFields`, missing sheet values are stored as `null` in Mongo.
     * `null` must show as 0 in the table — *not* fall back to aggs, or the UI shows wrong totals.
     * Omitted `undefined` still means "never set by import" → use aggs.
     */
    const totalOrders =
      x.importTotalOrders === null
        ? 0
        : x.importTotalOrders !== undefined && Number.isFinite(Number(x.importTotalOrders))
          ? Number(x.importTotalOrders)
          : aggOrders
    const totalBilled =
      x.importTotalBilledGhs === null
        ? 0
        : x.importTotalBilledGhs !== undefined && Number.isFinite(Number(x.importTotalBilledGhs))
          ? Number(x.importTotalBilledGhs)
          : aggLtv
    const totalCollected =
      x.importTotalCollectedGhs === null
        ? 0
        : x.importTotalCollectedGhs !== undefined && Number.isFinite(Number(x.importTotalCollectedGhs))
          ? Number(x.importTotalCollectedGhs)
          : 0
    const rcRaw = x.importReturnedCount
    const hasReturnedCount =
      rcRaw !== undefined &&
      rcRaw !== null &&
      Number.isFinite(Number(rcRaw))
    const returned =
      x.importReturnedCount === null
        ? 0
        : hasReturnedCount
          ? Number(x.importReturnedCount)
          : x.importReturnedGhs === null
            ? 0
            : x.importReturnedGhs != null && Number.isFinite(Number(x.importReturnedGhs))
              ? Number(x.importReturnedGhs)
              : 0
    const hasReturnCountForFmt =
      x.importReturnedCount != null && Number.isFinite(Number(x.importReturnedCount))

    const firstOrderAt: Date =
      x.importFirstOrderAt === null
        ? new Date(0)
        : x.importFirstOrderAt != null
          ? new Date(x.importFirstOrderAt)
          : aggFirst && !Number.isNaN(aggFirst.getTime())
            ? aggFirst
            : new Date(0)
    const lastOrderAt: Date =
      x.importLastOrderAt === null
        ? new Date(0)
        : x.importLastOrderAt != null
          ? new Date(x.importLastOrderAt)
          : aggLast && !Number.isNaN(aggLast.getTime())
            ? aggLast
            : new Date(0)

    const lastD =
      lastOrderAt.getTime() !== 0 && !Number.isNaN(lastOrderAt.getTime()) ? lastOrderAt : null
    const firstD =
      firstOrderAt.getTime() !== 0 && !Number.isNaN(firstOrderAt.getTime()) ? firstOrderAt : null

    let computedSeg: 'High LTV' | 'At risk' | 'New (30d)' | 'Core' = 'Core'
    if (lastD) {
      const firstForSeg = firstD ?? lastD
      computedSeg = segmentFor({
        customer: r.customer,
        orders: totalOrders,
        ltv: totalBilled,
        firstOrderAt: firstForSeg,
        lastOrderAt: lastD,
      })
    }

    return {
      id: String(x._id ?? ''),
      customerName: r.customer,
      phoneNumber: String(x.phone ?? ''),
      totalOrders,
      totalBilled,
      totalCollected,
      location: String(x.location ?? ''),
      returned,
      firstOrderDate: fmtDateYmd(firstOrderAt),
      lastOrderDate: fmtDateYmd(lastOrderAt),
      totalBilledFormatted: formatGhs(totalBilled),
      totalCollectedFormatted: formatGhs(totalCollected),
      returnedFormatted: hasReturnCountForFmt ? returned.toLocaleString() : formatGhs(returned),
      segment: x.segment ?? computedSeg,
      computedSegment: computedSeg,
    }
  })

  const seenKeys = new Set<string>()
  for (const c of customers) {
    seenKeys.add(customerListDedupeKey(c.customerName, c.phoneNumber))
  }

  type OutCustomer = (typeof customers)[number]
  const extras: OutCustomer[] = []

  const orderGroups = await db
    .collection(DTC_ORDERS_COLLECTION)
    .aggregate([
      { $match: { customer: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: {
            customer: '$customer',
            phone: { $ifNull: ['$customerPhone', ''] },
          },
          orderCount: { $sum: 1 },
          ltv: { $sum: '$totalAmount' },
          firstOrderedAt: { $min: '$orderedAt' },
          lastOrderedAt: { $max: '$orderedAt' },
          location: { $max: '$customerLocation' },
        },
      },
      { $limit: 50_000 },
    ])
    .toArray()

  for (const g of orderGroups as any[]) {
    const name = String(g._id?.customer ?? '').trim()
    if (!name) continue
    const phoneRaw = String(g._id?.phone ?? '')
    const k = customerListDedupeKey(name, phoneRaw)
    if (seenKeys.has(k)) continue
    seenKeys.add(k)

    const totalOrders = Number(g.orderCount ?? 0) || 0
    const totalBilled = Number(g.ltv ?? 0) || 0
    const aggFirst = g.firstOrderedAt ? new Date(g.firstOrderedAt) : null
    const aggLast = g.lastOrderedAt ? new Date(g.lastOrderedAt) : null
    const firstOrderAt =
      aggFirst && !Number.isNaN(aggFirst.getTime()) ? aggFirst : new Date(0)
    const lastOrderAt = aggLast && !Number.isNaN(aggLast.getTime()) ? aggLast : new Date(0)
    const lastD =
      lastOrderAt.getTime() !== 0 && !Number.isNaN(lastOrderAt.getTime()) ? lastOrderAt : null
    const firstD =
      firstOrderAt.getTime() !== 0 && !Number.isNaN(firstOrderAt.getTime()) ? firstOrderAt : null

    let computedSeg: 'High LTV' | 'At risk' | 'New (30d)' | 'Core' = 'Core'
    if (lastD) {
      const firstForSeg = firstD ?? lastD
      computedSeg = segmentFor({
        customer: name,
        orders: totalOrders,
        ltv: totalBilled,
        firstOrderAt: firstForSeg,
        lastOrderAt: lastD,
      })
    }

    extras.push({
      id: syntheticCustomerId('ord', name, phoneRaw),
      customerName: name,
      phoneNumber: phoneRaw.trim().slice(0, 40),
      totalOrders,
      totalBilled,
      totalCollected: 0,
      location: String(g.location ?? '').trim().slice(0, 200),
      returned: 0,
      firstOrderDate: fmtDateYmd(firstOrderAt),
      lastOrderDate: fmtDateYmd(lastOrderAt),
      totalBilledFormatted: formatGhs(totalBilled),
      totalCollectedFormatted: formatGhs(0),
      returnedFormatted: formatGhs(0),
      segment: computedSeg,
      computedSegment: computedSeg,
    })
  }

  const ledgerGroups = await db
    .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
    .aggregate([
      { $match: { customerName: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: {
            customer: '$customerName',
            phone: { $ifNull: ['$phoneNumber', ''] },
          },
          lineCount: { $sum: 1 },
          billed: { $sum: { $ifNull: ['$amountToCollectGhs', 0] } },
          collected: { $sum: { $ifNull: ['$totalCollectedGhs', 0] } },
          firstOrderedAt: { $min: '$orderedAt' },
          lastOrderedAt: { $max: '$orderedAt' },
          location: { $max: '$location' },
        },
      },
      { $limit: 25_000 },
    ])
    .toArray()

  for (const g of ledgerGroups as any[]) {
    const name = String(g._id?.customer ?? '').trim()
    if (!name) continue
    const phoneRaw = String(g._id?.phone ?? '')
    const k = customerListDedupeKey(name, phoneRaw)
    if (seenKeys.has(k)) continue
    seenKeys.add(k)

    const totalOrders = Number(g.lineCount ?? 0) || 0
    const totalBilled = Number(g.billed ?? 0) || 0
    const totalCollected = Number(g.collected ?? 0) || 0
    const aggFirst = g.firstOrderedAt ? new Date(g.firstOrderedAt) : null
    const aggLast = g.lastOrderedAt ? new Date(g.lastOrderedAt) : null
    const firstOrderAt =
      aggFirst && !Number.isNaN(aggFirst.getTime()) ? aggFirst : new Date(0)
    const lastOrderAt = aggLast && !Number.isNaN(aggLast.getTime()) ? aggLast : new Date(0)
    const lastD =
      lastOrderAt.getTime() !== 0 && !Number.isNaN(lastOrderAt.getTime()) ? lastOrderAt : null
    const firstD =
      firstOrderAt.getTime() !== 0 && !Number.isNaN(firstOrderAt.getTime()) ? firstOrderAt : null

    let computedSeg: 'High LTV' | 'At risk' | 'New (30d)' | 'Core' = 'Core'
    if (lastD) {
      const firstForSeg = firstD ?? lastD
      computedSeg = segmentFor({
        customer: name,
        orders: totalOrders,
        ltv: totalBilled,
        firstOrderAt: firstForSeg,
        lastOrderAt: lastD,
      })
    }

    extras.push({
      id: syntheticCustomerId('led', name, phoneRaw),
      customerName: name,
      phoneNumber: phoneRaw.trim().slice(0, 40),
      totalOrders,
      totalBilled,
      totalCollected,
      location: String(g.location ?? '').trim().slice(0, 200),
      returned: 0,
      firstOrderDate: fmtDateYmd(firstOrderAt),
      lastOrderDate: fmtDateYmd(lastOrderAt),
      totalBilledFormatted: formatGhs(totalBilled),
      totalCollectedFormatted: formatGhs(totalCollected),
      returnedFormatted: formatGhs(0),
      segment: computedSeg,
      computedSegment: computedSeg,
    })
  }

  const merged = [...customers, ...extras].sort((a, b) => {
    if (b.totalBilled !== a.totalBilled) return b.totalBilled - a.totalBilled
    if (b.totalOrders !== a.totalOrders) return b.totalOrders - a.totalOrders
    return a.customerName.localeCompare(b.customerName)
  })

  const segments = {
    highLtv: merged.filter((c) => c.segment === 'High LTV').length,
    atRisk: merged.filter((c) => c.segment === 'At risk').length,
    new30d: merged.filter((c) => c.segment === 'New (30d)').length,
    core: merged.filter((c) => c.segment === 'Core').length,
  }

  return NextResponse.json({ customers: merged, segments }, { headers: noStore })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createCustomerSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const customer = parsed.data.customer
  const phone = (parsed.data.phone ?? '').trim().slice(0, 40)

  const existing = await db
    .collection(DTC_CUSTOMERS_COLLECTION)
    .findOne({ customer, phone })
  if (existing) {
    return NextResponse.json({ customer }, { status: 200 })
  }

  await db.collection(DTC_CUSTOMERS_COLLECTION).insertOne({
    customer,
    phone,
    email: parsed.data.email ?? '',
    location: parsed.data.location ?? '',
    source: parsed.data.source ?? 'other',
    joinDate: parsed.data.joinDate ?? new Date(),
    segment: parsed.data.segment ?? undefined,
    importTotalOrders: parsed.data.totalOrders ?? undefined,
    importTotalBilledGhs: parsed.data.totalBilledGhs ?? undefined,
    importTotalCollectedGhs: parsed.data.totalCollectedGhs ?? undefined,
    ...(parsed.data.returned !== undefined
      ? parsed.data.returnedType === 'ghs'
        ? { importReturnedGhs: parsed.data.returned }
        : { importReturnedCount: Math.trunc(parsed.data.returned) }
      : {}),
    importFirstOrderAt: parsed.data.firstOrderDate ?? undefined,
    importLastOrderAt: parsed.data.lastOrderDate ?? undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  return NextResponse.json({ customer }, { status: 201 })
}
