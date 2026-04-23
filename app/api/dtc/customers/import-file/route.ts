import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  applyDtcCustomerImport,
  dtcImportRowSchema,
  type DtcImportRow,
} from '@/lib/dtc-customer-import-apply'
import { getMongo } from '@/lib/mongodb'
import { parseDtcCustomerXlsxBuffer } from '@/lib/parse-dtc-customer-xlsx'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 120

const CHUNK = 800
const MAX_FILE_BYTES = 20 * 1024 * 1024

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
  const parsed = parseDtcCustomerXlsxBuffer(buf)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { rows: rawRows, replaceIntelFields, stats: parseStats } = parsed
  const validatedRows: DtcImportRow[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const one = dtcImportRowSchema.safeParse(rawRows[i])
    if (!one.success) {
      const customer = (rawRows[i] as { customer?: string })?.customer ?? '—'
      return NextResponse.json(
        {
          error: `Row ${i + 1} (“${String(customer).slice(0, 80)}”) did not pass validation — check numbers, phone length, or email.`,
          issues: one.error.flatten(),
        },
        { status: 400 },
      )
    }
    validatedRows.push({ ...one.data, importRowIndex: validatedRows.length })
  }

  const { db } = getMongo()
  let inserted = 0
  let matched = 0
  let modified = 0
  for (let i = 0; i < validatedRows.length; i += CHUNK) {
    const chunk = validatedRows.slice(i, i + CHUNK)
    const res = await applyDtcCustomerImport(db, chunk, replaceIntelFields)
    inserted += res.upsertedCount ?? 0
    matched += res.matchedCount ?? 0
    modified += res.modifiedCount ?? 0
  }

  const uniqueCustomers = new Set(validatedRows.map((r) => r.customer)).size
  const duplicateRows = validatedRows.length - uniqueCustomers

  return NextResponse.json({
    ok: true,
    rowCount: validatedRows.length,
    uniqueCustomerCount: uniqueCustomers,
    duplicateRows,
    parseStats: {
      dataRowsInRange: parseStats.dataRowsInRange,
      droppedEmptyCustomer: parseStats.droppedEmptyCustomer,
    },
    replaceIntelFields,
    inserted,
    matched,
    modified,
  })
}
