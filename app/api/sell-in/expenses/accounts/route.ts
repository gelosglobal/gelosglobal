import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  createSellInExpenseAccount,
  listSellInExpenseAccounts,
  serializeSellInExpenseAccount,
} from '@/lib/sell-in-expense-accounts'
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

const postSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = getMongo()
  const rows = await listSellInExpenseAccounts(db)
  return NextResponse.json({ accounts: rows.map(serializeSellInExpenseAccount) })
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
  const created = await createSellInExpenseAccount(db, parsed.data.name)
  return NextResponse.json({ account: serializeSellInExpenseAccount(created) }, { status: 201 })
}

