import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeOrderStats,
  createDtcOrder,
  DTC_ORDERS_COLLECTION,
  listDtcOrders,
  serializeOrder,
} from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const createBodySchema = z.object({
  customer: z.string().min(1).max(200),
  customerPhone: z.string().trim().max(40).optional(),
  customerEmail: z.string().trim().max(200).optional(),
  customerLocation: z.string().trim().max(200).optional(),
  channel: z.enum(['Web', 'Instagram', 'B2B portal', 'TikTok', 'Other']),
  orderedAt: z
    .union([z.string().datetime(), z.string().min(1)])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), {
      message: 'Invalid orderedAt date',
    }),
  paymentMethod: z.enum([
    'cash',
    'momo',
    'card',
    'bank_transfer',
    'pay_on_delivery',
  ]),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64).optional(),
        name: z.string().trim().min(1).max(200),
        qty: z.coerce.number().int().positive().max(1_000_000),
        unitPrice: z.coerce.number().positive().max(10_000_000),
      }),
    )
    .min(1),
  discountGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  status: z
    .enum(['fulfilled', 'processing', 'pending_payment'])
    .optional()
    .default('processing'),
})

async function requireSession() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session) {
    return null
  }
  return session
}

export async function GET() {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { db } = getMongo()
  const rows = await listDtcOrders(db)
  const totalCount = await db.collection(DTC_ORDERS_COLLECTION).countDocuments({})
  const stats = computeOrderStats(rows)
  return NextResponse.json({
    orders: rows.map(serializeOrder),
    totalCount,
    stats: {
      ordersToday: stats.ordersToday,
      avgOrderValue: stats.avgOrderValue,
      awaitingFulfillment: stats.awaitingFulfillment,
    },
  })
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

  const parsed = createBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const created = await createDtcOrder(db, {
    customer: parsed.data.customer,
    customerPhone: parsed.data.customerPhone,
    customerEmail: parsed.data.customerEmail,
    customerLocation: parsed.data.customerLocation,
    channel: parsed.data.channel,
    paymentMethod: parsed.data.paymentMethod,
    items: parsed.data.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
    })),
    discountGhs: parsed.data.discountGhs,
    status: parsed.data.status,
    orderedAt: parsed.data.orderedAt,
  })
  return NextResponse.json({ order: serializeOrder(created) }, { status: 201 })
}
