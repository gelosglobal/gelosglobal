import { auth, ensureAuthMongo } from '@/lib/auth'
import { DTC_ORDERS_COLLECTION, formatGhs } from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'

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

const createCustomerSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(40).optional(),
  email: z.string().trim().email().optional(),
  location: z.string().trim().min(1).max(200).optional(),
  source: z.enum(['walk_in', 'instagram', 'web', 'referral', 'sales_rep', 'other']),
  joinDate: z
    .union([z.string().datetime(), z.string().min(1)])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), {
      message: 'Invalid joinDate',
    }),
  segment: z.enum(['High LTV', 'At risk', 'New (30d)', 'Core']).optional(),
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
          ordersCount: { $size: '$orders' },
          ltv: { $sum: '$orders.totalAmount' },
          firstOrderAt: { $min: '$orders.orderedAt' },
          lastOrderAt: { $max: '$orders.orderedAt' },
        },
      },
      {
        $project: {
          _id: 0,
          customer: 1,
          phone: 1,
          email: 1,
          location: 1,
          source: 1,
          joinDate: 1,
          segment: 1,
          orders: '$ordersCount',
          ltv: 1,
          firstOrderAt: 1,
          lastOrderAt: 1,
        },
      },
      { $sort: { ltv: -1, orders: -1, customer: 1 } },
      { $limit: 500 },
    ])
    .toArray()) as CustomerAgg[]

  const customers = rows.map((r) => {
    // Handle customers with 0 orders.
    const safe: CustomerAgg =
      r.orders > 0 && r.firstOrderAt && r.lastOrderAt
        ? r
        : {
            customer: r.customer,
            orders: 0,
            ltv: 0,
            firstOrderAt: new Date(0),
            lastOrderAt: new Date(0),
          }

    const computedSeg = safe.orders === 0 ? 'Core' : segmentFor(safe)
    return {
      customer: r.customer,
      phone: (r as any).phone ?? '',
      email: (r as any).email ?? '',
      location: (r as any).location ?? '',
      source: (r as any).source ?? 'other',
      joinDate: (r as any).joinDate ? new Date((r as any).joinDate).toISOString() : '',
      orders: r.orders,
      ltv: r.ltv,
      ltvFormatted: formatGhs(r.ltv),
      firstOrderAt: safe.orders === 0 ? '' : safe.firstOrderAt.toISOString(),
      lastOrderAt: safe.orders === 0 ? '' : safe.lastOrderAt.toISOString(),
      segment: (r as any).segment ?? computedSeg,
      computedSegment: computedSeg,
    }
  })

  const segments = {
    highLtv: customers.filter((c) => c.segment === 'High LTV').length,
    atRisk: customers.filter((c) => c.segment === 'At risk').length,
    new30d: customers.filter((c) => c.segment === 'New (30d)').length,
    core: customers.filter((c) => c.segment === 'Core').length,
  }

  return NextResponse.json({ customers, segments })
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

  // Idempotent create by name (exact match).
  const existing = await db
    .collection(DTC_CUSTOMERS_COLLECTION)
    .findOne({ customer })
  if (existing) {
    return NextResponse.json({ customer }, { status: 200 })
  }

  await db.collection(DTC_CUSTOMERS_COLLECTION).insertOne({
    customer,
    phone: parsed.data.phone ?? '',
    email: parsed.data.email ?? '',
    location: parsed.data.location ?? '',
    source: parsed.data.source,
    joinDate: parsed.data.joinDate ?? new Date(),
    segment: parsed.data.segment ?? undefined,
    createdAt: new Date(),
  })

  return NextResponse.json({ customer }, { status: 201 })
}
