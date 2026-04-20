import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeSfOrderStats,
  createSfOrder,
  listSfOrders,
  serializeSfOrder,
} from '@/lib/sf-orders'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'

const createBodySchema = z.object({
  outletName: z.string().trim().min(1).max(200),
  repName: z.string().trim().max(120).optional(),
  orderedAt: z
    .union([z.string().datetime(), z.string().min(1)])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), { message: 'Invalid orderedAt date' }),
  dueAt: z
    .union([z.string().datetime(), z.string().min(1)])
    .optional()
    .transform((v) => (v ? new Date(v) : undefined))
    .refine((d) => !d || !Number.isNaN(d.getTime()), { message: 'Invalid dueAt date' }),
  paidGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  status: z.enum(['ordered', 'in_transit', 'arrived']).optional().default('ordered'),
  notes: z.string().trim().max(5000).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64).optional(),
        name: z.string().trim().min(1).max(200),
        qty: z.coerce.number().int().positive().max(1_000_000),
        unitPriceGhs: z.coerce.number().min(0).max(1_000_000_000),
      }),
    )
    .min(1),
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
  const rows = await listSfOrders(db)
  const stats = computeSfOrderStats(rows)
  return NextResponse.json({
    orders: rows.map(serializeSfOrder),
    stats,
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

  const parsed = createBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const created = await createSfOrder(db, {
    outletName: parsed.data.outletName,
    repName: parsed.data.repName,
    orderedAt: parsed.data.orderedAt,
    dueAt: parsed.data.dueAt,
    paidGhs: parsed.data.paidGhs,
    status: parsed.data.status,
    notes: parsed.data.notes,
    items: parsed.data.items.map((i) => ({
      sku: i.sku,
      name: i.name,
      qty: i.qty,
      unitPriceGhs: i.unitPriceGhs,
    })),
  })

  return NextResponse.json({ order: serializeSfOrder(created) }, { status: 201 })
}

