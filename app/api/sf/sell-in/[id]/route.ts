import { auth, ensureAuthMongo } from '@/lib/auth'
import { deleteSfSellIn, serializeSfSellIn, updateSfSellIn } from '@/lib/sf-sell-in'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchSchema = z.object({
  sellInGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  productName: z.string().trim().min(1).max(200).optional(),
  country: z.string().trim().min(1).max(120).optional(),
  manufacturerName: z.string().trim().min(1).max(160).optional(),
  manufacturerContact: z.string().trim().min(1).max(200).optional(),
  occurredAt: z.coerce.date().optional(),
  quantity: z.coerce.number().int().min(0).max(100_000_000).optional(),
  status: z.enum(['ordered', 'in_transit', 'arrived']).optional(),
  etaAt: z.union([z.coerce.date(), z.null()]).optional(),
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
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const parsed = patchSchema.safeParse(body)
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
  const updated = await updateSfSellIn(db, new ObjectId(id), {
    ...parsed.data,
    etaAt:
      parsed.data.etaAt === undefined
        ? undefined
        : parsed.data.etaAt === null
          ? null
          : parsed.data.etaAt,
  })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ row: serializeSfSellIn(updated) })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { db } = getMongo()
  const ok = await deleteSfSellIn(db, new ObjectId(id))
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

