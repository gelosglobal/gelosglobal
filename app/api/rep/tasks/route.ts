import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { REP_TASKS_COLLECTION, serializeRepTask, type RepTaskDoc } from '@/lib/rep-tasks'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

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

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const reps = repIdentifiers(session as any)
  const { db } = getMongo()
  const rows = await db
    .collection<RepTaskDoc>(REP_TASKS_COLLECTION)
    .find({ repName: { $in: reps } })
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray()

  return NextResponse.json({ tasks: rows.map((r) => serializeRepTask(r as any)) })
}

