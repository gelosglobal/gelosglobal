import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  createB2BCashCollection,
  getOrCreateFinanceConfig,
  listB2BCashCollections,
  sumB2BCashCollections,
  sumB2BPortalOrderRevenue,
} from '@/lib/dtc-finance'
import { getMongo } from '@/lib/mongodb'
import {
  buildB2bPaymentsKpis,
  serializeB2bCashCollection,
} from '@/lib/sf-b2b-payments'
import { subDays } from 'date-fns'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const postBodySchema = z.object({
  amountGhs: z.coerce.number().positive().max(1_000_000_000),
  collectedAt: z.coerce.date().optional(),
  note: z.string().trim().max(2000).optional(),
  outletName: z.string().trim().max(200).optional(),
  repName: z.string().trim().max(120).optional(),
})

function parsePeriodDays(url: URL): number {
  const raw = url.searchParams.get('periodDays')
  const n = raw ? Number(raw) : 30
  if (!Number.isFinite(n)) return 30
  return Math.min(365, Math.max(7, Math.round(n)))
}

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

  const periodDays = parsePeriodDays(new URL(request.url))
  const now = new Date()
  const since = subDays(now, periodDays)

  const { db } = getMongo()
  const [rows, config, invoicedGhs, collectedGhs] = await Promise.all([
    listB2BCashCollections(db),
    getOrCreateFinanceConfig(db),
    sumB2BPortalOrderRevenue(db, since, now),
    sumB2BCashCollections(db, since, now),
  ])

  const kpis = buildB2bPaymentsKpis({
    periodDays,
    now,
    invoicedGhs,
    collectedGhs,
    outstandingGhs: config.b2bOutstandingGhs,
    totalLoggedEntries: rows.length,
  })

  return NextResponse.json({
    collections: rows.map(serializeB2bCashCollection),
    kpis,
  })
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

  const parsed = postBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const d = parsed.data
  const { db } = getMongo()
  const doc = await createB2BCashCollection(db, {
    amountGhs: d.amountGhs,
    collectedAt: d.collectedAt ?? new Date(),
    note: d.note,
    outletName: d.outletName,
    repName: d.repName,
  })

  return NextResponse.json(
    { ok: true, collection: serializeB2bCashCollection(doc) },
    { status: 201 },
  )
}
