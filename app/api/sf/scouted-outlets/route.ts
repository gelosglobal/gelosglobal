import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeScoutingStats,
  createScoutedOutlet,
  listScoutedOutlets,
  serializeScoutedOutlet,
  type ScoutOutletStatus,
} from '@/lib/sf-outlet-scouting'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusEnum = z.enum(['lead', 'qualified', 'in_review', 'won', 'lost'])
const priorityEnum = z.enum(['low', 'medium', 'high'])

const postBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    area: z.string().trim().min(1).max(200),
    contactName: z.string().trim().max(120).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
    estimatedMonthlyVolumeGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
    status: statusEnum.default('lead'),
    priority: priorityEnum.default('medium'),
    scoutedBy: z.string().trim().min(1).max(120),
    scoutedAt: z.coerce.date().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .superRefine((d, ctx) => {
    const hasL = d.latitude !== undefined
    const hasG = d.longitude !== undefined
    if (hasL !== hasG) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide both latitude and longitude, or neither',
        path: ['latitude'],
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
      ? (statusRaw as ScoutOutletStatus)
      : undefined

  const { db } = getMongo()
  const allRows = await listScoutedOutlets(db)
  const stats = computeScoutingStats(allRows)
  const rows = status ? allRows.filter((r) => r.status === status) : allRows
  return NextResponse.json({
    outlets: rows.map(serializeScoutedOutlet),
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

  const { db } = getMongo()
  const d = parsed.data
  const doc = await createScoutedOutlet(db, {
    name: d.name,
    area: d.area,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    notes: d.notes,
    estimatedMonthlyVolumeGhs: d.estimatedMonthlyVolumeGhs,
    status: d.status,
    priority: d.priority,
    scoutedBy: d.scoutedBy,
    scoutedAt: d.scoutedAt ?? new Date(),
    latitude: d.latitude,
    longitude: d.longitude,
  })

  const all = await listScoutedOutlets(db)
  const stats = computeScoutingStats(all)
  return NextResponse.json(
    { outlet: serializeScoutedOutlet(doc), stats },
    { status: 201 },
  )
}
