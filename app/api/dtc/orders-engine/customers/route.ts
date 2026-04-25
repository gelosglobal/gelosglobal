import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  listOrdersEngineCustomers,
  serializeDtcOrdersEngineCustomer,
} from '@/lib/dtc-orders-engine-customer-sheet'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

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
  const rows = await listOrdersEngineCustomers(db)
  return NextResponse.json(
    {
      customers: rows.map((r) => serializeDtcOrdersEngineCustomer(r)),
    },
    { headers: noStore },
  )
}

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00.000Z`)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const d = parsed.data
  const now = new Date()
  const { db } = getMongo()
  const doc = {
    customerName: d.customerName,
    phoneNumber: d.phoneNumber ?? '',
    location: d.location ?? '',
    totalOrders: d.totalOrders ?? 0,
    totalBilledGhs: d.totalBilledGhs ?? 0,
    totalCollectedGhs: d.totalCollectedGhs ?? 0,
    returned: d.returned ?? 0,
    firstOrderAt: parseYmdToNoonUtc(d.firstOrderDate),
    lastOrderAt: parseYmdToNoonUtc(d.lastOrderDate),
    createdAt: now,
    updatedAt: now,
  }

  const res = await db.collection('dtc_orders_engine_customers').insertOne(doc as any)
  const created = { _id: res.insertedId, ...doc } as any
  return NextResponse.json({ ok: true, customer: serializeDtcOrdersEngineCustomer(created) }, { status: 201, headers: noStore })
}

