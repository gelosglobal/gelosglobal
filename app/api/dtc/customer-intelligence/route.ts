import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  dtcCustomerIntelLedgerPhoneKey,
  formatLedgerItemsOrderedFromItems,
  insertDtcCustomerIntelLedgerRow,
  listDtcCustomerIntelLedgerRows,
  serializeDtcCustomerIntelLedgerRow,
} from '@/lib/dtc-customer-intelligence-ledger'
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
  const rows = await listDtcCustomerIntelLedgerRows(db)

  return NextResponse.json(
    {
      rows: rows.map((r) => serializeDtcCustomerIntelLedgerRow(r)),
    },
    { headers: noStore },
  )
}

const createLedgerRowSchema = z.object({
  date: z.string().optional(),
  orderNumber: z.string().optional(),
  itemsOrdered: z.string().optional(),
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
  customerName: z.string().min(1).max(200),
  phoneNumber: z.string().optional(),
  location: z.string().optional(),
  riderAssigned: z.string().optional(),
  amountToCollectGhs: z.coerce.number().min(0).optional(),
  cashCollectedGhs: z.coerce.number().min(0).optional(),
  momoCollectedGhs: z.coerce.number().min(0).optional(),
  paystackCollectedGhs: z.coerce.number().min(0).optional(),
  totalCollectedGhs: z.coerce.number().min(0).optional(),
  paymentMethod: z.string().optional(),
  deliveryStatus: z.string().optional(),
  remarks: z.string().optional(),
  additionalRemarks: z.string().optional(),
})

function ymdToNoonUtc(ymd: string | undefined) {
  const v = String(ymd ?? '').trim()
  if (!v) return null
  const d = new Date(`${v}T12:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
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

  const parsed = createLedgerRowSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 })
  }

  const { db } = getMongo()
  const now = new Date()
  const orderedAt = ymdToNoonUtc(parsed.data.date) ?? null
  const items = Array.isArray(parsed.data.items)
    ? parsed.data.items
        .map((it) => ({
          ...(it.sku ? { sku: it.sku.trim() } : {}),
          name: it.name.trim(),
          qty: Number(it.qty),
          unitPrice: Number(it.unitPrice),
        }))
        .filter((it) => it.name && Number.isFinite(it.qty) && it.qty > 0)
    : []
  const computedItemsOrdered = formatLedgerItemsOrderedFromItems(items)
  const doc = {
    // Orders Engine creates operational orders; ensure they land in date-range reporting even if date is left blank.
    orderedAt: orderedAt ?? now,
    orderNumber: parsed.data.orderNumber?.trim() || undefined,
    itemsOrdered: parsed.data.itemsOrdered?.trim() || computedItemsOrdered || undefined,
    items: items.length ? items : undefined,
    customerName: parsed.data.customerName.trim(),
    phoneNumber: dtcCustomerIntelLedgerPhoneKey(parsed.data.phoneNumber) || undefined,
    location: parsed.data.location?.trim() || undefined,
    riderAssigned: parsed.data.riderAssigned?.trim() || undefined,
    amountToCollectGhs: Number(parsed.data.amountToCollectGhs ?? 0) || 0,
    cashCollectedGhs: Number(parsed.data.cashCollectedGhs ?? 0) || 0,
    momoCollectedGhs: Number(parsed.data.momoCollectedGhs ?? 0) || 0,
    paystackCollectedGhs: Number(parsed.data.paystackCollectedGhs ?? 0) || 0,
    totalCollectedGhs: Number(parsed.data.totalCollectedGhs ?? 0) || 0,
    paymentMethod: parsed.data.paymentMethod?.trim() || undefined,
    deliveryStatus: parsed.data.deliveryStatus?.trim() || undefined,
    remarks: parsed.data.remarks?.trim() || undefined,
    additionalRemarks: parsed.data.additionalRemarks?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  }

  const created = await insertDtcCustomerIntelLedgerRow(db, doc)

  return NextResponse.json({ row: serializeDtcCustomerIntelLedgerRow(created) }, { status: 201, headers: noStore })
}

