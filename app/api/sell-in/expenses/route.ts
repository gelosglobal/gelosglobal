import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  createSellInExpense,
  listSellInExpensesForMonth,
  serializeSellInExpense,
} from '@/lib/sell-in-expenses'
import { listSellInExpenseAccounts } from '@/lib/sell-in-expense-accounts'
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

const postSchema = z.object({
  accountId: z.string().trim().min(1).max(80),
  occurredAt: z.coerce.date(),
  amountGhs: z.coerce.number().min(0).max(1_000_000_000),
  category: categorySchema,
  description: z.string().trim().min(1).max(400),
  paymentMethod: paymentMethodSchema.optional(),
  status: statusSchema.optional(),
  paidBy: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const monthRaw = searchParams.get('month')
  const now = new Date()
  const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : fallbackMonth
  const { db } = getMongo()
  const rows = await listSellInExpensesForMonth(db, month)
  return NextResponse.json({ rows: rows.map(serializeSellInExpense) })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const d = parsed.data
  const accounts = await listSellInExpenseAccounts(db)
  const acct = accounts.find((a) => a._id.toHexString() === d.accountId)
  if (!acct) {
    return NextResponse.json({ error: 'Invalid accountId' }, { status: 400 })
  }
  const created = await createSellInExpense(db, {
    accountId: d.accountId,
    accountName: acct.name,
    occurredAt: d.occurredAt,
    amountGhs: d.amountGhs,
    category: d.category,
    description: d.description,
    paymentMethod: d.paymentMethod,
    status: d.status,
    paidBy: d.paidBy,
    notes: d.notes,
  })

  return NextResponse.json({ row: serializeSellInExpense(created) }, { status: 201 })
}

