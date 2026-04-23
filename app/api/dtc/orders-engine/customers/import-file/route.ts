import { auth, ensureAuthMongo } from '@/lib/auth'
import { getMongo } from '@/lib/mongodb'
import {
  DTC_ORDERS_ENGINE_CUSTOMERS_COLLECTION,
  type DtcOrdersEngineCustomerDoc,
} from '@/lib/dtc-orders-engine-customer-sheet'
import { parseDtcOrdersEngineCustomersXlsxBuffer } from '@/lib/parse-dtc-orders-engine-customers-xlsx'
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
  const parsed = parseDtcOrdersEngineCustomersXlsxBuffer(buf)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { db } = getMongo()
  const now = new Date()

  let inserted = 0
  let matched = 0
  let modified = 0

  for (let i = 0; i < parsed.rows.length; i += CHUNK) {
    const chunk = parsed.rows.slice(i, i + CHUNK)
    const ops = chunk.map((r, j) => {
      const importRowIndex = i + j
      const filter = {
        customerName: r.customerName,
        phoneNumber: (r.phoneNumber ?? '').trim().slice(0, 40),
        importRowIndex,
      }

      const $set: Partial<DtcOrdersEngineCustomerDoc> = {
        updatedAt: now,
        customerName: r.customerName,
        phoneNumber: (r.phoneNumber ?? '').trim().slice(0, 40),
        totalOrders: r.totalOrders ?? 0,
        totalBilledGhs: r.totalBilledGhs ?? 0,
        totalCollectedGhs: r.totalCollectedGhs ?? 0,
        location: r.location ?? '',
        returned: r.returned ?? 0,
        firstOrderAt: r.firstOrderAt,
        lastOrderAt: r.lastOrderAt,
        importRowIndex,
      }

      return {
        updateOne: {
          filter,
          update: { $setOnInsert: { createdAt: now }, $set },
          upsert: true,
        },
      }
    })

    const res = await db
      .collection(DTC_ORDERS_ENGINE_CUSTOMERS_COLLECTION)
      .bulkWrite(ops, { ordered: false })
    inserted += res.upsertedCount ?? 0
    matched += res.matchedCount ?? 0
    modified += res.modifiedCount ?? 0
  }

  return NextResponse.json({
    ok: true,
    rowCount: parsed.rows.length,
    parseStats: parsed.stats,
    inserted,
    matched,
    modified,
  })
}

