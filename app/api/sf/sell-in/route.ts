import { auth, ensureAuthMongo } from '@/lib/auth'
import { createSfSellIn, listSfSellIn, serializeSfSellIn } from '@/lib/sf-sell-in'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const postSchema = z.object({
  sellInGhs: z.coerce.number().min(0).max(1_000_000_000),
  productName: z.string().trim().min(1).max(200),
  country: z.string().trim().min(1).max(120),
  manufacturerName: z.string().trim().min(1).max(160),
  manufacturerContact: z.string().trim().min(1).max(200),
  occurredAt: z.coerce.date(),
  quantity: z.coerce.number().int().min(0).max(100_000_000),
  status: z.enum(['ordered', 'in_transit', 'arrived']),
  etaAt: z.coerce.date().optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { db } = getMongo()
  const rows = await listSfSellIn(db)
  return NextResponse.json({ rows: rows.map(serializeSfSellIn) })
}

export async function POST(request: Request) {
  const session = await requireSession()
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
  const created = await createSfSellIn(db, {
    sellInGhs: parsed.data.sellInGhs,
    productName: parsed.data.productName,
    country: parsed.data.country,
    manufacturerName: parsed.data.manufacturerName,
    manufacturerContact: parsed.data.manufacturerContact,
    occurredAt: parsed.data.occurredAt,
    quantity: parsed.data.quantity,
    status: parsed.data.status,
    etaAt: parsed.data.etaAt,
  })

  return NextResponse.json({ row: serializeSfSellIn(created) }, { status: 201 })
}

