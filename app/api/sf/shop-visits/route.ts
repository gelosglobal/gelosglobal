import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computeShopVisitStats,
  createShopVisit,
  listShopVisits,
  serializeShopVisit,
  type SfVisitStatus,
} from '@/lib/sf-shop-visits'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusEnum = z.enum(['scheduled', 'completed', 'cancelled'])
const visitTypeEnum = z.enum([
  'routine',
  'follow_up',
  'new_listing',
  'issue_resolution',
  'other',
])

const postBodySchema = z
  .object({
    outletName: z.string().trim().min(1).max(200),
    area: z.string().trim().max(200).optional(),
    repName: z.string().trim().min(1).max(120),
    status: statusEnum,
    scheduledAt: z.coerce.date().optional(),
    visitedAt: z.coerce.date().optional(),
    sellInGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    visitType: visitTypeEnum.optional(),
    durationMinutes: z.coerce.number().int().min(0).max(24 * 60).optional(),
    notes: z.string().trim().max(5000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.status === 'scheduled' && d.scheduledAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Scheduled visits need a scheduled date',
        path: ['scheduledAt'],
      })
    }
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
  const statusRaw = searchParams.get('status')
  const status =
    statusRaw && statusEnum.safeParse(statusRaw).success
      ? (statusRaw as SfVisitStatus)
      : undefined

  const { db } = getMongo()
  const allRows = await listShopVisits(db)
  const now = new Date()
  const stats = computeShopVisitStats(allRows, now)
  const rows = status ? allRows.filter((r) => r.status === status) : allRows
  return NextResponse.json({
    visits: rows.map(serializeShopVisit),
    stats,
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
  const visitedAt =
    d.status === 'completed' ? (d.visitedAt ?? new Date()) : d.visitedAt

  const { db } = getMongo()
  const doc = await createShopVisit(db, {
    outletName: d.outletName,
    area: d.area,
    repName: d.repName,
    status: d.status,
    scheduledAt: d.scheduledAt,
    visitedAt,
    sellInGhs: d.sellInGhs,
    visitType: d.visitType,
    durationMinutes: d.durationMinutes,
    notes: d.notes,
  })

  const all = await listShopVisits(db)
  const stats = computeShopVisitStats(all, new Date())
  return NextResponse.json(
    { visit: serializeShopVisit(doc), stats },
    { status: 201 },
  )
}
