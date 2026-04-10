import { auth, ensureAuthMongo } from '@/lib/auth'
import { createB2BCashCollection } from '@/lib/dtc-finance'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const postSchema = z.object({
  amountGhs: z.coerce.number().positive().max(1_000_000_000),
  collectedAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
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

  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const doc = await createB2BCashCollection(db, {
    amountGhs: parsed.data.amountGhs,
    collectedAt: parsed.data.collectedAt ?? new Date(),
    note: parsed.data.note,
  })

  return NextResponse.json({
    ok: true,
    id: doc._id.toHexString(),
    amountGhs: doc.amountGhs,
    collectedAt: doc.collectedAt.toISOString(),
  })
}
