import { auth, ensureAuthMongo } from '@/lib/auth'
import { logRepPageView } from '@/lib/rep-activity'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const bodySchema = z.object({
  pathname: z.string().trim().min(1).max(300),
  pageTitle: z.string().trim().min(1).max(200),
  visitedAt: z.string().datetime().optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // Better Auth session shape varies by provider; fall back gracefully.
  const repName =
    (session as any)?.user?.name ||
    (session as any)?.user?.email ||
    (session as any)?.user?.id ||
    'Unknown'

  const { db } = getMongo()
  await logRepPageView(db, {
    repName: String(repName),
    pathname: parsed.data.pathname,
    pageTitle: parsed.data.pageTitle,
    visitedAt: parsed.data.visitedAt ? new Date(parsed.data.visitedAt) : undefined,
  })

  return NextResponse.json({ ok: true })
}

