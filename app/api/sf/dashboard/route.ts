import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeSfDashboardSnapshot } from '@/lib/sf-dashboard'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const querySchema = z.object({
  start: z.string().datetime().optional(),
  end: z.string().datetime().optional(),
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

  const url = new URL(request.url)
  const parsed = querySchema.safeParse({
    start: url.searchParams.get('start') ?? undefined,
    end: url.searchParams.get('end') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const rangeStart = parsed.data.start ? new Date(parsed.data.start) : undefined
  const rangeEnd = parsed.data.end ? new Date(parsed.data.end) : undefined
  if (rangeStart && rangeEnd && rangeStart.getTime() > rangeEnd.getTime()) {
    return NextResponse.json({ error: 'start must be <= end' }, { status: 400 })
  }

  const { db } = getMongo()
  const snapshot = await computeSfDashboardSnapshot(db, { rangeStart, rangeEnd })
  return NextResponse.json(snapshot)
}
