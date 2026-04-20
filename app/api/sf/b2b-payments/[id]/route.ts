import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  deleteSfB2bInvoice,
  serializeSfB2bInvoice,
  updateSfB2bInvoice,
} from '@/lib/sf-b2b-invoices'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).optional(),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  unitPriceGhs: z.coerce.number().min(0).max(1_000_000_000),
})

const patchBodySchema = z
  .object({
    outletName: z.string().trim().min(1).max(200).optional(),
    invoiceNumber: z.string().trim().min(1).max(64).optional(),
    amountGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    discountGhs: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
    paidGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    items: z.array(itemSchema).max(200).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    repName: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
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
  const updated = await updateSfB2bInvoice(db, new ObjectId(id), parsed.data)
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    invoice: serializeSfB2bInvoice(updated),
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
  const ok = await deleteSfB2bInvoice(db, new ObjectId(id))
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
