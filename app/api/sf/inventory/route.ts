import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeSfInventoryStats,
  createSfInventoryItem,
  listSfInventory,
  serializeSfInventoryItem,
  SF_INVENTORY_COLLECTION,
  SF_INVENTORY_DEFAULT_OUTLET,
} from '@/lib/sf-inventory'
import { SF_ORDERS_COLLECTION } from '@/lib/sf-orders'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { subDays } from 'date-fns'
import { z } from 'zod'

export const runtime = 'nodejs'

const createBodySchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  repName: z.string().trim().min(1).max(120).optional(),
  costGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  priceGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  onHand: z.coerce.number().int().min(0).max(100_000_000),
  safetyStock: z.coerce.number().int().min(0).max(100_000_000),
  reorderQty: z.coerce.number().int().min(0).max(100_000_000).optional(),
  lastCountedAt: z.string().datetime().optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET() {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { db } = getMongo()
  const now = new Date()
  const velocityWindowDays = 30
  const since = subDays(now, velocityWindowDays)

  const rows = await listSfInventory(db)

  const skuVelocity = new Map<string, number>()
  const agg = await db
    .collection(SF_ORDERS_COLLECTION)
    .aggregate<{ sku: string; units: number }>([
      { $match: { orderedAt: { $gte: since, $lte: now } } },
      { $unwind: '$items' },
      {
        $match: {
          'items.sku': { $type: 'string' },
        },
      },
      {
        $group: {
          _id: { sku: { $toUpper: '$items.sku' } },
          units: { $sum: { $ifNull: ['$items.qty', 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          units: 1,
        },
      },
    ])
    .toArray()

  for (const r of agg) {
    const units = Number(r.units) || 0
    skuVelocity.set(String(r.sku).toUpperCase(), units / velocityWindowDays)
  }

  const stats = computeSfInventoryStats(rows)
  return NextResponse.json({
    items: rows.map((row) => {
      const base = serializeSfInventoryItem(row)
      const v = skuVelocity.get(base.sku.toUpperCase())
      const dailyDemand = v ? Math.round(v * 10) / 10 : 0
      const daysCover = dailyDemand > 0 ? Math.floor(base.onHand / dailyDemand) : null
      return { ...base, dailyDemand, daysCover }
    }),
    stats,
  })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const skuUpper = parsed.data.sku.toUpperCase()
  const existing = await db
    .collection(SF_INVENTORY_COLLECTION)
    .findOne({ sku: skuUpper })
  if (existing) {
    return NextResponse.json(
      { error: 'That SKU already exists in retail inventory.' },
      { status: 409 },
    )
  }

  const doc = await createSfInventoryItem(db, {
    ...parsed.data,
    sku: skuUpper,
    dailyDemand: 0,
    lastCountedAt: parsed.data.lastCountedAt
      ? new Date(parsed.data.lastCountedAt)
      : undefined,
  })

  return NextResponse.json({ item: serializeSfInventoryItem(doc) }, { status: 201 })
}

