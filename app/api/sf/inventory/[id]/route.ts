import { auth, ensureAuthMongo } from '@/lib/auth'
import { canMutateSfInventory } from '@/lib/access'
import {
  SF_INVENTORY_COLLECTION,
  serializeSfInventoryItem,
  updateSfInventoryItem,
} from '@/lib/sf-inventory'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchBodySchema = z.object({
  sku: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  repName: z.string().trim().min(1).max(120).nullable().optional(),
  costGhs: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  priceGhs: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  onHand: z.coerce.number().int().min(0).max(100_000_000).optional(),
  safetyStock: z.coerce.number().int().min(0).max(100_000_000).optional(),
  reorderQty: z.coerce.number().int().min(0).max(100_000_000).nullable().optional(),
  lastCountedAt: z.string().datetime().nullable().optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canMutateSfInventory(session as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { db } = getMongo()
  const result = await updateSfInventoryItem(db, new ObjectId(id), {
    ...parsed.data,
    lastCountedAt:
      parsed.data.lastCountedAt === undefined
        ? undefined
        : parsed.data.lastCountedAt === null
          ? null
          : new Date(parsed.data.lastCountedAt),
  })
  if (!result.ok) {
    if (result.reason === 'duplicate_sku') {
      return NextResponse.json(
        { error: 'That SKU already exists in retail inventory.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ item: serializeSfInventoryItem(result.doc) })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canMutateSfInventory(session as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { db } = getMongo()
  const res = await db
    .collection(SF_INVENTORY_COLLECTION)
    .deleteOne({ _id: new ObjectId(id) })

  if (!res.deletedCount) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

