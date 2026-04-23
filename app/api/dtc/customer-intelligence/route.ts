import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION,
  listDtcCustomerIntelLedgerRows,
  serializeDtcCustomerIntelLedgerRow,
} from '@/lib/dtc-customer-intelligence-ledger'
import { applyDtcCustomerImport, type DtcImportRow } from '@/lib/dtc-customer-import-apply'
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

function phoneKey(v: string | undefined) {
  return String(v ?? '')
    .replace(/[^\d+]/g, '')
    .trim()
    .slice(0, 40)
}

function isReturnedish(s: string) {
  const t = s.trim().toLowerCase()
  return t.includes('returned') || t.includes('return')
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
  const doc = {
    orderedAt: orderedAt ?? undefined,
    orderNumber: parsed.data.orderNumber?.trim() || undefined,
    itemsOrdered: parsed.data.itemsOrdered?.trim() || undefined,
    customerName: parsed.data.customerName.trim(),
    phoneNumber: phoneKey(parsed.data.phoneNumber) || undefined,
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

  const res = await db.collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION).insertOne(doc)
  const created = { _id: res.insertedId, ...doc } as any

  // Keep `dtc_customers` in sync so search + dashboards update immediately.
  try {
    const name = doc.customerName
    const p = doc.phoneNumber ?? ''
    const rows = await db
      .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
      .find(
        { customerName: name, phoneNumber: p ? p : { $in: [undefined, null, ''] } },
        {
          projection: {
            orderedAt: 1,
            amountToCollectGhs: 1,
            totalCollectedGhs: 1,
            cashCollectedGhs: 1,
            momoCollectedGhs: 1,
            paystackCollectedGhs: 1,
            location: 1,
            riderAssigned: 1,
            deliveryStatus: 1,
            remarks: 1,
            additionalRemarks: 1,
          },
        },
      )
      .toArray()

    let orders = 0
    let billed = 0
    let collected = 0
    let cash = 0
    let momo = 0
    let paystack = 0
    let returnedCount = 0
    let firstAt: Date | undefined = undefined
    let lastAt: Date | undefined = undefined
    let location: string | undefined = undefined
    let riderAssigned: string | undefined = undefined
    let remarks: string | undefined = undefined

    for (const r of rows as any[]) {
      orders += 1
      billed += Number(r.amountToCollectGhs ?? 0) || 0
      collected += Number(r.totalCollectedGhs ?? 0) || 0
      cash += Number(r.cashCollectedGhs ?? 0) || 0
      momo += Number(r.momoCollectedGhs ?? 0) || 0
      paystack += Number(r.paystackCollectedGhs ?? 0) || 0
      const hit =
        isReturnedish(String(r.deliveryStatus ?? '')) ||
        isReturnedish(String(r.remarks ?? '')) ||
        isReturnedish(String(r.additionalRemarks ?? ''))
      if (hit) returnedCount += 1

      if (r.location) location = String(r.location)
      if (r.riderAssigned) riderAssigned = String(r.riderAssigned)
      const dt = r.orderedAt instanceof Date ? r.orderedAt : r.orderedAt ? new Date(String(r.orderedAt)) : null
      if (dt && !Number.isNaN(dt.getTime())) {
        if (!firstAt || dt.getTime() < firstAt.getTime()) firstAt = dt
        if (!lastAt || dt.getTime() > lastAt.getTime()) lastAt = dt
      }
      const rm = [r.remarks, r.additionalRemarks].filter(Boolean).join(' · ')
      if (rm) remarks = String(rm)
    }

    const importRow: DtcImportRow = {
      customer: name,
      phone: p || undefined,
      location,
      riderAssigned,
      remarks,
      amountToBeCollectedGhs: billed,
      acCashCollectedGhs: cash,
      acMomoGhs: momo,
      acPaystackGhs: paystack,
      importTotalOrders: orders,
      importTotalBilledGhs: billed,
      importTotalCollectedGhs: collected,
      importReturnedCount: returnedCount,
      importFirstOrderAt: firstAt,
      importLastOrderAt: lastAt,
    }
    await applyDtcCustomerImport(db, [importRow], true)
  } catch {
    // best-effort; ledger row creation should still succeed
  }

  return NextResponse.json({ row: serializeDtcCustomerIntelLedgerRow(created) }, { status: 201, headers: noStore })
}

