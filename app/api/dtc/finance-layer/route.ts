import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeFinanceLayerSnapshot,
  computeFinanceLayerSnapshotForRange,
  updateFinanceConfig,
} from '@/lib/dtc-finance'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const putSchema = z.object({
  b2bOutstandingGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  cogsPctOfRevenue: z.coerce.number().min(0).max(1).optional(),
  fixedOpexPeriodGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
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
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const rawDays = searchParams.get('days')
  const days = Math.min(
    365,
    Math.max(1, rawDays ? Number.parseInt(rawDays, 10) || 30 : 30),
  )

  const { db } = getMongo()
  if ((start && !end) || (!start && end)) {
    return NextResponse.json({ error: 'Provide both start and end' }, { status: 400 })
  }
  const since = start ? new Date(start) : null
  const until = end ? new Date(end) : null
  if ((since && Number.isNaN(since.getTime())) || (until && Number.isNaN(until.getTime()))) {
    return NextResponse.json({ error: 'Invalid start/end datetime' }, { status: 400 })
  }
  if (since && until && since.getTime() > until.getTime()) {
    return NextResponse.json({ error: 'start must be <= end' }, { status: 400 })
  }

  const { snapshot, config } =
    since && until
      ? await computeFinanceLayerSnapshotForRange(db, { since, until })
      : await computeFinanceLayerSnapshot(db, days)
  return NextResponse.json({
    ...snapshot,
    config: {
      b2bOutstandingGhs: config.b2bOutstandingGhs,
      cogsPctOfRevenue: config.cogsPctOfRevenue,
      fixedOpexPeriodGhs: config.fixedOpexPeriodGhs,
    },
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
  await updateFinanceConfig(db, parsed.data)

  const { searchParams } = new URL(request.url)
  const rawDays = searchParams.get('days')
  const days = Math.min(
    365,
    Math.max(1, rawDays ? Number.parseInt(rawDays, 10) || 30 : 30),
  )
  const { snapshot, config } = await computeFinanceLayerSnapshot(db, days)
  return NextResponse.json({
    ...snapshot,
    config: {
      b2bOutstandingGhs: config.b2bOutstandingGhs,
      cogsPctOfRevenue: config.cogsPctOfRevenue,
      fixedOpexPeriodGhs: config.fixedOpexPeriodGhs,
    },
  })
}
