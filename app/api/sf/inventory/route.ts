import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeSfInventoryStats,
  createSfInventoryItem,
  listSfInventory,
  serializeSfInventoryItem,
  SF_INVENTORY_COLLECTION,
} from '@/lib/sf-inventory'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const createBodySchema = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  outlet: z.string().trim().min(1).max(160),
  repName: z.string().trim().min(1).max(120).optional(),
  onHand: z.coerce.number().int().min(0).max(100_000_000),
  safetyStock: z.coerce.number().int().min(0).max(100_000_000),
  dailyDemand: z.coerce.number().min(0).max(1_000_000),
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
  const rows = await listSfInventory(db)
  const stats = computeSfInventoryStats(rows)
  return NextResponse.json({
    items: rows.map(serializeSfInventoryItem),
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
  const outletTrim = parsed.data.outlet.trim()
  const existing = await db
    .collection(SF_INVENTORY_COLLECTION)
    .findOne({ sku: skuUpper, outlet: outletTrim })
  if (existing) {
    return NextResponse.json(
      { error: 'That SKU already exists for this outlet.' },
      { status: 409 },
    )
  }

  const doc = await createSfInventoryItem(db, {
    ...parsed.data,
    sku: skuUpper,
    outlet: outletTrim,
    lastCountedAt: parsed.data.lastCountedAt
      ? new Date(parsed.data.lastCountedAt)
      : undefined,
  })

  return NextResponse.json({ item: serializeSfInventoryItem(doc) }, { status: 201 })
}

