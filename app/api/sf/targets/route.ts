import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeSfTargetsWithActuals,
  createSfTarget,
  SF_TARGETS_COLLECTION,
  type SfTargetMonthKey,
} from '@/lib/sf-targets'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/)

const createBodySchema = z.object({
  month: monthKeySchema,
  repName: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120).optional(),
  targetVisits: z.coerce.number().int().min(0).max(10_000),
  targetSellInGhs: z.coerce.number().min(0).max(1_000_000_000),
  notes: z.string().trim().max(2000).optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const monthRaw = searchParams.get('month')
  const month: SfTargetMonthKey | null =
    monthRaw && monthKeySchema.safeParse(monthRaw).success ? (monthRaw as SfTargetMonthKey) : null
  if (!month) {
    return NextResponse.json({ error: 'Missing or invalid month (YYYY-MM)' }, { status: 400 })
  }

  const { db } = getMongo()
  const rows = await computeSfTargetsWithActuals(db, month)
  return NextResponse.json({ month, items: rows })
}

export async function POST(request: Request) {
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

  const parsed = createBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const existing = await db.collection(SF_TARGETS_COLLECTION).findOne({
    month: parsed.data.month,
    repName: parsed.data.repName.trim(),
  })
  if (existing) {
    return NextResponse.json(
      { error: 'A target already exists for this rep and month.' },
      { status: 409 },
    )
  }

  const doc = await createSfTarget(db, parsed.data)
  return NextResponse.json({ item: doc._id.toHexString() }, { status: 201 })
}

