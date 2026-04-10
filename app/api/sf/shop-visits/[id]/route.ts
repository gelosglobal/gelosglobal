import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computeShopVisitStats,
  deleteShopVisit,
  listShopVisits,
  serializeShopVisit,
  updateShopVisit,
} from '@/lib/sf-shop-visits'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusEnum = z.enum(['scheduled', 'completed', 'cancelled'])
const visitTypeEnum = z.enum([
  'routine',
  'follow_up',
  'new_listing',
  'issue_resolution',
  'other',
])

const patchBodySchema = z
  .object({
    outletName: z.string().trim().min(1).max(200).optional(),
    area: z.string().trim().max(200).nullable().optional(),
    repName: z.string().trim().min(1).max(120).optional(),
    status: statusEnum.optional(),
    scheduledAt: z.coerce.date().nullable().optional(),
    visitedAt: z.coerce.date().nullable().optional(),
    sellInGhs: z.coerce
      .number()
      .min(0)
      .max(1_000_000_000)
      .nullable()
      .optional(),
    visitType: visitTypeEnum.nullable().optional(),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .nullable()
      .optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

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

  const { db } = getMongo()
  const updated = await updateShopVisit(db, new ObjectId(id), parsed.data)
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const all = await listShopVisits(db)
  const stats = computeShopVisitStats(all, new Date())
  return NextResponse.json({
    visit: serializeShopVisit(updated),
    stats,
  })
}

export async function DELETE(
  _request: Request,
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

  const { db } = getMongo()
  const ok = await deleteShopVisit(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const all = await listShopVisits(db)
  const stats = computeShopVisitStats(all, new Date())
  return NextResponse.json({ ok: true, stats })
}
