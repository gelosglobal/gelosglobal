import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { REP_TASKS_COLLECTION, serializeRepTask, type RepTaskDoc } from '@/lib/rep-tasks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

function repIdentifiers(session: any): string[] {
  const raw = [
    session?.user?.name,
    session?.user?.email,
    session?.user?.id,
  ]
    .filter((v) => typeof v === 'string')
    .map((v: string) => v.trim())
    .filter(Boolean)
  return Array.from(new Set(raw))
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const status = body?.status
  if (status !== 'started' && status !== 'in_progress' && status !== 'done') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const reps = repIdentifiers(session as any)
  const { db } = getMongo()

  const existing = await db
    .collection<RepTaskDoc>(REP_TASKS_COLLECTION)
    .findOne({ _id: new ObjectId(id) } as any)

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!reps.includes(String((existing as any).repName))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const res = await db
    .collection(REP_TASKS_COLLECTION)
    .findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: 'after' },
    )

  if (!res) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, task: serializeRepTask(res as any) })
}

