import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'
const DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION = 'dtc_customer_intelligence_ledger'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

/** Must match client confirmation string exactly. */
const CLEAR_DTC_CUSTOMERS_CONFIRM = 'CLEAR_ALL_DTC_CUSTOMERS'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const bodySchema = z.object({
  confirm: z.literal(CLEAR_DTC_CUSTOMERS_CONFIRM),
})

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Body must include confirm: "${CLEAR_DTC_CUSTOMERS_CONFIRM}"` },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const [ledgerRes, customersRes] = await Promise.all([
    db.collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION).deleteMany({}),
    db.collection(DTC_CUSTOMERS_COLLECTION).deleteMany({}),
  ])

  return NextResponse.json(
    {
      deletedLedgerRows: ledgerRes.deletedCount,
      deletedCustomerRows: customersRes.deletedCount,
    },
    { headers: noStore },
  )
}

