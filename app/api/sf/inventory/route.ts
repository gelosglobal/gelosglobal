import { auth, ensureAuthMongo } from '@/lib/auth'
import { canMutateSfInventory } from '@/lib/access'
import {
  createSfInventoryItem,
  listSfInventoryWithOrderVelocity,
  serializeSfInventoryItem,
  SF_INVENTORY_COLLECTION,
  SF_INVENTORY_DEFAULT_OUTLET,
} from '@/lib/sf-inventory'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
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
  const { items, stats } = await listSfInventoryWithOrderVelocity(db)
  return NextResponse.json({
    items,
    stats,
  })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canMutateSfInventory(session as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

