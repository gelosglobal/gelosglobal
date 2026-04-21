import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  deleteSellInExpenseAccount,
  serializeSellInExpenseAccount,
  updateSellInExpenseAccount,
} from '@/lib/sell-in-expense-accounts'
import { SELL_IN_EXPENSES_COLLECTION } from '@/lib/sell-in-expenses'
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

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
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
  const updated = await updateSellInExpenseAccount(db, new ObjectId(id), parsed.data.name)
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, account: serializeSellInExpenseAccount(updated) })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { db } = getMongo()
  const used = await db.collection(SELL_IN_EXPENSES_COLLECTION).countDocuments({ accountId: id }, { limit: 1 })
  if (used > 0) {
    return NextResponse.json(
      { error: 'Account has expenses. Reassign or delete expenses first.' },
      { status: 409 },
    )
  }
  const ok = await deleteSellInExpenseAccount(db, new ObjectId(id))
  return NextResponse.json({ ok })
}

