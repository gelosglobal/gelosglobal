import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeSfReportsSnapshot,
  defaultSfReportsRange,
} from '@/lib/sf-reports'
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

function parseDateOnly(raw: string | null): Date | null {
  if (!raw) return null
  const t = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const [y, m, d] = t.split('-').map(Number)
  if (!y || !m || !d) return null
  // local date; downstream will normalize to startOfDay
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const from = parseDateOnly(searchParams.get('from'))
  const to = parseDateOnly(searchParams.get('to'))
  const fallback = defaultSfReportsRange(new Date())

  const { db } = getMongo()
  const snapshot = await computeSfReportsSnapshot(db, {
    from: from ?? fallback.from,
    to: to ?? fallback.to,
  })
  return NextResponse.json(snapshot)
}

