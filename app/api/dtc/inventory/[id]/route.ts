import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  serializeInventoryItem,
  updateDtcInventoryItem,
} from '@/lib/dtc-inventory'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  warehouse: z.string().trim().min(1).max(120).optional(),
  onHand: z.coerce.number().int().min(0).max(100_000_000).optional(),
  safetyStock: z.coerce.number().int().min(0).max(100_000_000).optional(),
  dailyDemand: z.coerce.number().min(0).max(1_000_000).optional(),
  inTransitValue: z.coerce.number().min(0).max(1_000_000_000).optional(),
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
  const updated = await updateDtcInventoryItem(
    db,
    new ObjectId(id),
    parsed.data,
  )
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ item: serializeInventoryItem(updated) })
}
