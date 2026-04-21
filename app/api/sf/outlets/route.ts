import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { SF_OUTLETS_COLLECTION, type SfOutletDoc } from '@/lib/sf-dashboard'
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
  const rows = await db
    .collection<SfOutletDoc>(SF_OUTLETS_COLLECTION)
    .find({}, { projection: { name: 1, isActive: 1, region: 1, createdAt: 1 } })
    .sort({ name: 1 })
    .limit(5000)
    .toArray()

  const outlets = rows
    .map((r: any) => ({
      id: String(r._id),
      name: String(r.name ?? '').trim(),
      isActive: Boolean(r.isActive),
      region: r.region ? String(r.region) : null,
    }))
    .filter((r) => r.name.length > 0)

  return NextResponse.json({ outlets })
}

