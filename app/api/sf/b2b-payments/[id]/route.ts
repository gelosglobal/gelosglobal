import { auth, ensureAuthMongo } from '@/lib/auth'
import { deleteB2BCashCollection, updateB2BCashCollection } from '@/lib/dtc-finance'
import { getMongo } from '@/lib/mongodb'
import { serializeB2bCashCollection } from '@/lib/sf-b2b-payments'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchBodySchema = z
  .object({
    amountGhs: z.coerce.number().positive().max(1_000_000_000).optional(),
    collectedAt: z.coerce.date().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
    outletName: z.string().trim().max(200).nullable().optional(),
    repName: z.string().trim().max(120).nullable().optional(),
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
  const updated = await updateB2BCashCollection(db, new ObjectId(id), parsed.data)
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    collection: serializeB2bCashCollection(updated),
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
  const ok = await deleteB2BCashCollection(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
