import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { getUserAccess } from '@/lib/access'
import { createRepTask, listRepTasks, serializeRepTask } from '@/lib/rep-tasks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

async function requireMaster() {
  await ensureAuthMongo()
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const access = getUserAccess(session as any)
  if (!access.sections.has('master')) return null
  return session
}

const postSchema = z.object({
  repName: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notes: z.string().trim().max(2000).optional(),
})

export async function GET() {
  const session = await requireMaster()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = getMongo()
  const rows = await listRepTasks(db)
  return NextResponse.json({ tasks: rows.map(serializeRepTask) })
}

export async function POST(request: Request) {
  const session = await requireMaster()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const d = parsed.data
  const created = await createRepTask(db, {
    repName: d.repName,
    title: d.title,
    dueAt: d.dueAt ? new Date(d.dueAt) : undefined,
    priority: d.priority,
    notes: d.notes,
  })

  return NextResponse.json({ ok: true, task: serializeRepTask(created) }, { status: 201 })
}

