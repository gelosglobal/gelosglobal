import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  getOrCreateSfSettings,
  updateSfSettings,
} from '@/lib/sf-dashboard'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const putSchema = z.object({
  monthlyTargetGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  primaryRegionLabel: z.string().trim().max(120).optional(),
})

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
  const doc = await getOrCreateSfSettings(db)
  return NextResponse.json({
    monthlyTargetGhs: doc.monthlyTargetGhs,
    primaryRegionLabel: doc.primaryRegionLabel,
  })
}

export async function PUT(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { db } = getMongo()
  const doc = await updateSfSettings(db, parsed.data)
  return NextResponse.json({
    monthlyTargetGhs: doc.monthlyTargetGhs,
    primaryRegionLabel: doc.primaryRegionLabel,
  })
}
