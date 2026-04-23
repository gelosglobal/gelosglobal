import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DTC_ORDERS_ENGINE_CUSTOMERS_COLLECTION = 'dtc_orders_engine_customers'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const patchSchema = z.object({
  customerName: z.string().trim().min(1).max(200).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  location: z.string().trim().max(200).optional(),
  totalOrders: z.coerce.number().int().min(0).max(10_000_000).optional(),
  totalBilledGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  totalCollectedGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  returned: z.coerce.number().int().min(0).max(100_000_000).optional(),
  firstOrderDate: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  lastOrderDate: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
})

function parseYmdToNoonUtc(value: string | undefined) {
  if (!value) return undefined
  // Accept YYYY-MM-DD (from <input type="date">)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00.000Z`)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const d = parsed.data
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (d.customerName !== undefined) $set.customerName = d.customerName
  if (d.phoneNumber !== undefined) $set.phoneNumber = d.phoneNumber
  if (d.location !== undefined) $set.location = d.location
  if (d.totalOrders !== undefined) $set.totalOrders = d.totalOrders
  if (d.totalBilledGhs !== undefined) $set.totalBilledGhs = d.totalBilledGhs
  if (d.totalCollectedGhs !== undefined) $set.totalCollectedGhs = d.totalCollectedGhs
  if (d.returned !== undefined) $set.returned = d.returned
  if (d.firstOrderDate !== undefined) $set.firstOrderAt = parseYmdToNoonUtc(d.firstOrderDate)
  if (d.lastOrderDate !== undefined) $set.lastOrderAt = parseYmdToNoonUtc(d.lastOrderDate)

  const { db } = getMongo()
  const res = await db
    .collection(DTC_ORDERS_ENGINE_CUSTOMERS_COLLECTION)
    .updateOne({ _id: oid }, { $set })

  if (res.matchedCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(
    { ok: true, matched: res.matchedCount, modified: res.modifiedCount },
    { headers: noStore },
  )
}

