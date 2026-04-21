import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  deleteSellInExpense,
  updateSellInExpense,
  serializeSellInExpense,
} from '@/lib/sell-in-expenses'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const categorySchema = z.enum([
  'shipping',
  'customs',
  'storage',
  'logistics',
  'marketing',
  'samples',
  'other',
])

const paymentMethodSchema = z.enum(['cash', 'momo', 'bank_transfer', 'cheque', 'card', 'other'])
const statusSchema = z.enum(['pending', 'paid'])

const patchSchema = z
  .object({
    accountId: z.string().trim().min(1).max(80).optional(),
    occurredAt: z.coerce.date().optional(),
    amountGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    category: categorySchema.optional(),
    description: z.string().trim().min(1).max(400).optional(),
    paymentMethod: paymentMethodSchema.nullable().optional(),
    status: statusSchema.nullable().optional(),
    paidBy: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

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

  const { db } = getMongo()
  const updated = await updateSellInExpense(db, new ObjectId(id), parsed.data)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true, row: serializeSellInExpense(updated) })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { db } = getMongo()
  const ok = await deleteSellInExpense(db, new ObjectId(id))
  return NextResponse.json({ ok })
}

