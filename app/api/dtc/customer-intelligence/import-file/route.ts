import { auth, ensureAuthMongo } from '@/lib/auth'
import { applyDtcCustomerImport, type DtcImportRow } from '@/lib/dtc-customer-import-apply'
import {
  DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION,
  type DtcCustomerIntelLedgerDoc,
} from '@/lib/dtc-customer-intelligence-ledger'
import { getMongo } from '@/lib/mongodb'
import { parseDtcCustomerIntelLedgerXlsxBuffer } from '@/lib/parse-dtc-customer-intel-ledger-xlsx'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120
export const dynamic = 'force-dynamic'

const MAX_FILE_BYTES = 20 * 1024 * 1024
const CHUNK = 800

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

function phoneKey(phone: string | undefined) {
  return (phone ?? '').trim().slice(0, 40)
}

function toDateOrNull(v: unknown): Date | null {
  if (v == null) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file (use field name "file")' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` },
      { status: 400 },
    )
  }
  const name = file.name.toLowerCase()
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.xlsm')) {
    return NextResponse.json({ error: 'Upload an Excel file (.xlsx, .xls, or .xlsm)' }, { status: 400 })
  }

  const buf = await file.arrayBuffer()
  const parsed = parseDtcCustomerIntelLedgerXlsxBuffer(buf)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { db } = getMongo()
  const now = new Date()

  // 1) Store raw ledger rows (one document per physical file row).
  const ledgerOps = parsed.rows.map((r, i) => {
    const filter = {
      customerName: r.customerName,
      phoneNumber: phoneKey(r.phoneNumber),
      importRowIndex: i,
    }
    const $set: Partial<DtcCustomerIntelLedgerDoc> = {
      updatedAt: now,
      orderedAt: r.orderedAt,
      orderNumber: r.orderNumber,
      customerName: r.customerName,
      phoneNumber: phoneKey(r.phoneNumber),
      location: r.location,
      riderAssigned: r.riderAssigned,
      amountToCollectGhs: r.amountToCollectGhs,
      cashCollectedGhs: r.cashCollectedGhs,
      momoCollectedGhs: r.momoCollectedGhs,
      paystackCollectedGhs: r.paystackCollectedGhs,
      totalCollectedGhs: r.totalCollectedGhs,
      paymentMethod: r.paymentMethod,
      deliveryStatus: r.deliveryStatus,
      remarks: r.remarks,
      additionalRemarks: r.additionalRemarks,
      importRowIndex: i,
    }
    return {
      updateOne: {
        filter,
        update: { $setOnInsert: { createdAt: now }, $set },
        upsert: true,
      },
    }
  })

  if (ledgerOps.length > 0) {
    await db
      .collection(DTC_CUSTOMER_INTELLIGENCE_LEDGER_COLLECTION)
      .bulkWrite(ledgerOps, { ordered: false })
  }

  // 2) Aggregate into customer intelligence totals (so dashboards stay aligned).
  type Agg = {
    customer: string
    phone?: string
    location?: string
    riderAssigned?: string
    orders: number
    billed: number
    collected: number
    cash: number
    momo: number
    paystack: number
    returnedCount: number
    firstAt?: Date
    lastAt?: Date
    remarks?: string
  }
  const groups = new Map<string, Agg>()
  const isReturned = (s: string) => {
    const t = s.trim().toLowerCase()
    return t.includes('returned') || t.includes('return')
  }

  for (const row of parsed.rows) {
    const key = `${row.customerName}|||${phoneKey(row.phoneNumber)}`
    const billed = Number(row.amountToCollectGhs ?? 0) || 0
    const collected = Number(row.totalCollectedGhs ?? 0) || 0
    const cash = Number(row.cashCollectedGhs ?? 0) || 0
    const momo = Number(row.momoCollectedGhs ?? 0) || 0
    const paystack = Number(row.paystackCollectedGhs ?? 0) || 0
    const returnedCount = isReturned(row.deliveryStatus ?? '') || isReturned(row.remarks ?? '') ? 1 : 0
    const dt = toDateOrNull(row.orderedAt)

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        customer: row.customerName,
        phone: phoneKey(row.phoneNumber) || undefined,
        location: row.location,
        riderAssigned: row.riderAssigned,
        orders: 1,
        billed,
        collected,
        cash,
        momo,
        paystack,
        returnedCount,
        firstAt: dt,
        lastAt: dt,
        remarks: [row.remarks, row.additionalRemarks].filter(Boolean).join(' · ') || undefined,
      })
      continue
    }
    existing.orders += 1
    existing.billed += billed
    existing.collected += collected
    existing.cash += cash
    existing.momo += momo
    existing.paystack += paystack
    existing.returnedCount += returnedCount
    if (row.location) existing.location = row.location
    if (row.riderAssigned) existing.riderAssigned = row.riderAssigned
    if (dt) {
      const firstAt = toDateOrNull(existing.firstAt)
      const lastAt = toDateOrNull(existing.lastAt)
      if (!firstAt || dt.getTime() < firstAt.getTime()) existing.firstAt = dt
      if (!lastAt || dt.getTime() > lastAt.getTime()) existing.lastAt = dt
    }
  }

  const customerRows: DtcImportRow[] = Array.from(groups.values()).map((g, i) => ({
    customer: g.customer,
    phone: g.phone,
    location: g.location,
    riderAssigned: g.riderAssigned,
    amountToBeCollectedGhs: g.billed,
    acCashCollectedGhs: g.cash,
    acMomoGhs: g.momo,
    acPaystackGhs: g.paystack,
    remarks: g.remarks,
    importTotalOrders: g.orders,
    importTotalBilledGhs: g.billed,
    importTotalCollectedGhs: g.collected,
    importReturnedCount: g.returnedCount,
    importFirstOrderAt: g.firstAt,
    importLastOrderAt: g.lastAt,
    importRowIndex: i,
  }))

  let inserted = 0
  let matched = 0
  let modified = 0
  for (let i = 0; i < customerRows.length; i += CHUNK) {
    const chunk = customerRows.slice(i, i + CHUNK)
    const res = await applyDtcCustomerImport(db, chunk, true)
    inserted += res.upsertedCount ?? 0
    matched += res.matchedCount ?? 0
    modified += res.modifiedCount ?? 0
  }

  return NextResponse.json({
    ok: true,
    ledgerRowCount: parsed.rows.length,
    customerAggCount: customerRows.length,
    parseStats: parsed.stats,
    inserted,
    matched,
    modified,
  })
}

