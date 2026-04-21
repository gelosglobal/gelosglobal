import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  getOrCreateSellInExpenseBudget,
  serializeSellInExpenseBudget,
  setSellInExpenseBudget,
} from '@/lib/sell-in-expense-budget'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/)

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const monthRaw = searchParams.get('month')
  const now = new Date()
  const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month =
    monthRaw && monthKeySchema.safeParse(monthRaw).success ? monthRaw : fallbackMonth

  const { db } = getMongo()
  const doc = await getOrCreateSellInExpenseBudget(db, month)
  return NextResponse.json({ budget: serializeSellInExpenseBudget(doc) })
}

const putSchema = z.object({
  month: monthKeySchema,
  budgetGhs: z.coerce.number().min(0).max(1_000_000_000),
})

export async function PUT(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const updated = await setSellInExpenseBudget(db, parsed.data.month, parsed.data.budgetGhs)
  return NextResponse.json({ budget: serializeSellInExpenseBudget(updated) })
}

