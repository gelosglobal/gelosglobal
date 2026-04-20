import { auth, ensureAuthMongo } from '@/lib/auth'
import { deleteSfOrder, serializeSfOrder, updateSfOrder } from '@/lib/sf-orders'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  outletName: z.string().trim().min(1).max(200).optional(),
  repName: z.string().trim().max(120).nullable().optional(),
  orderedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  paidGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  status: z.enum(['ordered', 'in_transit', 'arrived']).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { db } = getMongo()
  const updated = await updateSfOrder(db, new ObjectId(id), {
    ...parsed.data,
    repName: parsed.data.repName === undefined ? undefined : parsed.data.repName,
    dueAt: parsed.data.dueAt === undefined ? undefined : parsed.data.dueAt,
    notes: parsed.data.notes === undefined ? undefined : parsed.data.notes,
  })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ order: serializeSfOrder(updated) })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const { db } = getMongo()
  const ok = await deleteSfOrder(db, new ObjectId(id))
  if (!ok) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

