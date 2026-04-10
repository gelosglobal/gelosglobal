import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeProductPerformance } from '@/lib/dtc-product-performance'
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
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { db } = getMongo()
  const { rows, highlights } = await computeProductPerformance(db)
  return NextResponse.json({
    rows,
    highlights,
    period: {
      label: 'Last 7 days vs prior 7 days',
      generatedAt: new Date().toISOString(),
    },
  })
}
