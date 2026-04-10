import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeScoutingStats,
  deleteScoutedOutlet,
  listScoutedOutlets,
  serializeScoutedOutlet,
  updateScoutedOutlet,
} from '@/lib/sf-outlet-scouting'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusEnum = z.enum(['lead', 'qualified', 'in_review', 'won', 'lost'])
const priorityEnum = z.enum(['low', 'medium', 'high'])

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    area: z.string().trim().min(1).max(200).optional(),
    contactName: z.string().trim().max(120).nullable().optional(),
    contactPhone: z.string().trim().max(40).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    estimatedMonthlyVolumeGhs: z.coerce
      .number()
      .min(0)
      .max(1_000_000_000)
      .nullable()
      .optional(),
    status: statusEnum.optional(),
    priority: priorityEnum.optional(),
    scoutedBy: z.string().trim().min(1).max(120).optional(),
    scoutedAt: z.coerce.date().optional(),
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
  const updated = await updateScoutedOutlet(db, new ObjectId(id), parsed.data)
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const all = await listScoutedOutlets(db)
  const stats = computeScoutingStats(all)
  return NextResponse.json({
    outlet: serializeScoutedOutlet(updated),
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
  const ok = await deleteScoutedOutlet(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const all = await listScoutedOutlets(db)
  const stats = computeScoutingStats(all)
  return NextResponse.json({ ok: true, stats })
}
