import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeRetailCustomerIntelligence } from '@/lib/sf-customer-intelligence'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

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
  const { rows, segments } = await computeRetailCustomerIntelligence(db)
  return NextResponse.json({
    rows,
    segments,
    generatedAt: new Date().toISOString(),
  })
}

