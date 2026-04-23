import { auth, ensureAuthMongo } from '@/lib/auth'
import { applyDtcCustomerImport, dtcImportBodySchema } from '@/lib/dtc-customer-import-apply'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
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

  const parsed = dtcImportBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { db } = getMongo()
  const rows = parsed.data.rows.map((row, i) => ({ ...row, importRowIndex: i }))
  const res = await applyDtcCustomerImport(
    db,
    rows,
    parsed.data.replaceIntelFields === true,
  )

  return NextResponse.json({
    ok: true,
    inserted: res.upsertedCount ?? 0,
    matched: res.matchedCount ?? 0,
    modified: res.modifiedCount ?? 0,
    chunkSize: parsed.data.rows.length,
  })
}
