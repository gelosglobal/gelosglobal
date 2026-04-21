import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const DTC_CUSTOMERS_COLLECTION = 'dtc_customers'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const sourceSchema = z.enum(['walk_in', 'instagram', 'web', 'referral', 'sales_rep', 'other'])
const segmentSchema = z.enum(['High LTV', 'At risk', 'New (30d)', 'Core'])

const rowSchema = z.object({
  customer: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(0).max(40).optional(),
  email: z.string().trim().email().optional(),
  location: z.string().trim().min(0).max(200).optional(),
  source: sourceSchema.optional(),
  joinDate: z.string().datetime().optional(),
  segment: segmentSchema.optional(),
  riderAssigned: z.string().trim().min(0).max(120).optional(),
  amountToBeCollectedGhs: z.number().optional(),
  acCashCollectedGhs: z.number().optional(),
  acMomoGhs: z.number().optional(),
  acPaystackGhs: z.number().optional(),
  remarks: z.string().trim().min(0).max(2000).optional(),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(5000),
})

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
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const now = new Date()
  const { db } = getMongo()

  const ops = parsed.data.rows.map((r) => ({
    updateOne: {
      filter: { customer: r.customer },
      update: {
        $setOnInsert: { createdAt: now },
        $set: {
          updatedAt: now,
          customer: r.customer,
          phone: r.phone ?? '',
          email: r.email ?? '',
          location: r.location ?? '',
          source: r.source ?? 'other',
          joinDate: r.joinDate ? new Date(r.joinDate) : now,
          segment: r.segment ?? undefined,
          riderAssigned: r.riderAssigned ?? undefined,
          amountToBeCollectedGhs: r.amountToBeCollectedGhs ?? undefined,
          acCashCollectedGhs: r.acCashCollectedGhs ?? undefined,
          acMomoGhs: r.acMomoGhs ?? undefined,
          acPaystackGhs: r.acPaystackGhs ?? undefined,
          remarks: r.remarks ?? undefined,
        },
      },
      upsert: true,
    },
  }))

  const res = await db.collection(DTC_CUSTOMERS_COLLECTION).bulkWrite(ops, { ordered: false })

  return NextResponse.json({
    ok: true,
    inserted: res.upsertedCount ?? 0,
    matched: res.matchedCount ?? 0,
  })
}

