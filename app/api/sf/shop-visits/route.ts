import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computeShopVisitStatsForRange,
  createShopVisit,
  filterShopVisitsByRange,
  listShopVisits,
  serializeShopVisit,
  type SfVisitStatus,
} from '@/lib/sf-shop-visits'
import { endOfDay, startOfDay, subDays } from 'date-fns'
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

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

function parseVisitDateRange(searchParams: URLSearchParams) {
  const now = new Date()
  const defaultFrom = startOfDay(subDays(now, 6))
  const defaultTo = endOfDay(now)

  const fromRaw = searchParams.get('from')
  const toRaw = searchParams.get('to')
  const fromOk = fromRaw && ymdSchema.safeParse(fromRaw).success
  const toOk = toRaw && ymdSchema.safeParse(toRaw).success

  let start = fromOk ? startOfDay(new Date(`${fromRaw}T12:00:00`)) : defaultFrom
  let end = toOk ? endOfDay(new Date(`${toRaw}T12:00:00`)) : defaultTo
  if (start.getTime() > end.getTime()) {
    const tmp = start
    start = startOfDay(end)
    end = endOfDay(tmp)
  }
  return { start, end }
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
  const range = parseVisitDateRange(searchParams)
  let rows = filterShopVisitsByRange(allRows, range)
  if (status) rows = rows.filter((r) => r.status === status)
  const stats = computeShopVisitStatsForRange(allRows, range)
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
  const stats = computeShopVisitStatsForRange(all, {
    start: startOfDay(subDays(new Date(), 6)),
    end: endOfDay(new Date()),
  })
  return NextResponse.json(
    { visit: serializeShopVisit(doc), stats },
    { status: 201 },
  )
}
