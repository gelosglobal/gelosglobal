import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION = 'dtc_customer_intelligence_ledger'

const noStore = { 'Cache-Control': 'private, no-store, max-age=0' } as const

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const patchSchema = z.object({
  date: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : undefined)),
  orderNumber: z.string().trim().max(64).optional(),
  itemsOrdered: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64).optional(),
        name: z.string().trim().min(1).max(200),
        qty: z.coerce.number().int().positive().max(1_000_000),
        unitPrice: z.coerce.number().min(0).max(10_000_000),
      }),
    )
    .optional(),
  customerName: z.string().trim().min(1).max(200).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  location: z.string().trim().max(200).optional(),
  riderAssigned: z.string().trim().max(120).optional(),
  amountToCollectGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  cashCollectedGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  momoCollectedGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  paystackCollectedGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  totalCollectedGhs: z.coerce.number().min(0).max(1_000_000_000).optional(),
  paymentMethod: z.string().trim().max(80).optional(),
  deliveryStatus: z.string().trim().max(80).optional(),
  remarks: z.string().trim().max(2000).optional(),
  additionalRemarks: z.string().trim().max(2000).optional(),
})

function parseYmdToNoonUtc(value: string | undefined) {
  if (!value) return undefined
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
  if (d.date !== undefined) $set.orderedAt = parseYmdToNoonUtc(d.date)
  if (d.orderNumber !== undefined) $set.orderNumber = d.orderNumber
  if (d.items !== undefined) {
    const items = Array.isArray(d.items)
      ? d.items
          .map((it) => ({
            ...(it.sku ? { sku: it.sku.trim() } : {}),
            name: it.name.trim(),
            qty: Number(it.qty),
            unitPrice: Number(it.unitPrice),
          }))
          .filter((it) => it.name && Number.isFinite(it.qty) && it.qty > 0)
      : []
    $set.items = items.length ? items : undefined
    const computedItemsOrdered = items
      .map((it) => (it.qty > 1 ? `${it.name} x${it.qty}` : it.name))
      .filter(Boolean)
      .join(', ')
    // If caller didn't supply a separate itemsOrdered string, keep it in sync.
    if (d.itemsOrdered === undefined) $set.itemsOrdered = computedItemsOrdered || undefined
  }
  if (d.itemsOrdered !== undefined) $set.itemsOrdered = d.itemsOrdered
  if (d.customerName !== undefined) $set.customerName = d.customerName
  if (d.phoneNumber !== undefined) $set.phoneNumber = d.phoneNumber
  if (d.location !== undefined) $set.location = d.location
  if (d.riderAssigned !== undefined) $set.riderAssigned = d.riderAssigned
  if (d.amountToCollectGhs !== undefined) $set.amountToCollectGhs = d.amountToCollectGhs
  if (d.cashCollectedGhs !== undefined) $set.cashCollectedGhs = d.cashCollectedGhs
  if (d.momoCollectedGhs !== undefined) $set.momoCollectedGhs = d.momoCollectedGhs
  if (d.paystackCollectedGhs !== undefined) $set.paystackCollectedGhs = d.paystackCollectedGhs
  if (d.totalCollectedGhs !== undefined) $set.totalCollectedGhs = d.totalCollectedGhs
  if (d.paymentMethod !== undefined) $set.paymentMethod = d.paymentMethod
  if (d.deliveryStatus !== undefined) $set.deliveryStatus = d.deliveryStatus
  if (d.remarks !== undefined) $set.remarks = d.remarks
  if (d.additionalRemarks !== undefined) $set.additionalRemarks = d.additionalRemarks

  const { db } = getMongo()
  const res = await db
    .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
    .updateOne({ _id: oid }, { $set })

  if (res.matchedCount === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true }, { headers: noStore })
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const { db } = getMongo()
  const res = await db.collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION).deleteOne({ _id: oid })
  if (res.deletedCount !== 1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true }, { headers: noStore })
}

