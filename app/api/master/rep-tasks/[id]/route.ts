import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { getUserAccess } from '@/lib/access'
import { deleteRepTask, serializeRepTask, updateRepTask } from '@/lib/rep-tasks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
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

const patchSchema = z
  .object({
    repName: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    dueAt: z.string().datetime().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['started', 'in_progress', 'done']).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' })

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireMaster()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const d = parsed.data
  const updated = await updateRepTask(db, new ObjectId(id), {
    ...d,
    dueAt: d.dueAt === undefined ? undefined : d.dueAt === null ? null : new Date(d.dueAt),
  })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, task: serializeRepTask(updated) })
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireMaster()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const { db } = getMongo()
  const ok = await deleteRepTask(db, new ObjectId(id))
  return NextResponse.json({ ok })
}

