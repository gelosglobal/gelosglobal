import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computePosmTaskStats,
  deletePosmTask,
  listPosmTasks,
  serializePosmTask,
  updatePosmTask,
} from '@/lib/sf-posm-tasks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusEnum = z.enum(['open', 'done'])

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    outletName: z.string().trim().min(1).max(200).optional(),
    status: statusEnum.optional(),
    dueAt: z.coerce.date().nullable().optional(),
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
  const updated = await updatePosmTask(db, new ObjectId(id), parsed.data)
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const all = await listPosmTasks(db)
  const stats = computePosmTaskStats(all, new Date())
  return NextResponse.json({
    task: serializePosmTask(updated),
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
  const ok = await deletePosmTask(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const all = await listPosmTasks(db)
  const stats = computePosmTaskStats(all, new Date())
  return NextResponse.json({ ok: true, stats })
}
