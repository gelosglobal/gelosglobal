import { auth, ensureAuthMongo } from '@/lib/auth'
import { deleteDtcOrder, serializeOrder, updateDtcOrder } from '@/lib/dtc-orders'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const patchBodySchema = z
  .object({
    customer: z.string().trim().min(1).max(200).optional(),
    channel: z.enum(['Web', 'Instagram', 'B2B portal', 'TikTok', 'Other']).optional(),
    paymentMethod: z
      .enum(['cash', 'momo', 'card', 'bank_transfer', 'pay_on_delivery'])
      .optional(),
    items: z
      .array(
        z.object({
          sku: z.string().trim().min(1).max(64).optional(),
          name: z.string().trim().min(1).max(200),
          qty: z.coerce.number().int().positive().max(1_000_000),
          unitPrice: z.coerce.number().positive().max(10_000_000),
        }),
      )
      .min(1)
      .optional(),
    discountGhs: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    status: z.enum(['fulfilled', 'processing', 'pending_payment']).optional(),
    orderedAt: z.string().datetime().optional(),
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
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const updated = await updateDtcOrder(db, new ObjectId(id), {
    customer: parsed.data.customer,
    channel: parsed.data.channel,
    paymentMethod: parsed.data.paymentMethod,
    items: parsed.data.items?.map((i) => ({
      sku: i.sku,
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
    })),
    discountGhs: parsed.data.discountGhs,
    status: parsed.data.status,
    orderedAt: parsed.data.orderedAt ? new Date(parsed.data.orderedAt) : undefined,
  })

  if (!updated) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json({ order: serializeOrder(updated) })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const { db } = getMongo()
  const ok = await deleteDtcOrder(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}

