import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  computePosmTaskStats,
  createPosmTask,
  listPosmTasks,
  serializePosmTask,
  type SfPosmTaskStatus,
} from '@/lib/sf-posm-tasks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const statusEnum = z.enum(['open', 'done'])

const postBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  outletName: z.string().trim().min(1).max(200),
  status: statusEnum.default('open'),
  dueAt: z.coerce.date().optional(),
  notes: z.string().trim().max(5000).optional(),
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
      ? (statusRaw as SfPosmTaskStatus)
      : undefined

  const { db } = getMongo()
  const allRows = await listPosmTasks(db)
  const now = new Date()
  const stats = computePosmTaskStats(allRows, now)
  const rows = status ? allRows.filter((r) => r.status === status) : allRows
  return NextResponse.json({
    tasks: rows.map(serializePosmTask),
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
  const { db } = getMongo()
  const doc = await createPosmTask(db, {
    title: d.title,
    outletName: d.outletName,
    status: d.status,
    dueAt: d.dueAt,
    notes: d.notes,
  })

  const all = await listPosmTasks(db)
  const stats = computePosmTaskStats(all, new Date())
  return NextResponse.json(
    { task: serializePosmTask(doc), stats },
    { status: 201 },
  )
}
