import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeMarketingAttribution } from '@/lib/dtc-marketing-attribution'
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
  const snapshot = await computeMarketingAttribution(db, 30)
  return NextResponse.json(snapshot)
}
