import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  listOrdersEngineCustomers,
  serializeDtcOrdersEngineCustomer,
} from '@/lib/dtc-orders-engine-customer-sheet'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { db } = getMongo()
  const rows = await listOrdersEngineCustomers(db)
  return NextResponse.json(
    {
      customers: rows.map((r) => serializeDtcOrdersEngineCustomer(r)),
    },
    { headers: noStore },
  )
}

