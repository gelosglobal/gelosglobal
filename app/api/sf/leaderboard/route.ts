import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  computeSfLeaderboard,
  defaultSfLeaderboardRange,
  type SfLeaderboardMetric,
} from '@/lib/sf-leaderboard'
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
  const dt = new Date(y, m - 1, d, 12, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt
}

function parseMetric(raw: string | null): SfLeaderboardMetric {
  if (raw === 'visits' || raw === 'outlets' || raw === 'sellIn') return raw
  return 'sellIn'
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const from = parseDateOnly(searchParams.get('from'))
  const to = parseDateOnly(searchParams.get('to'))
  const metric = parseMetric(searchParams.get('metric'))
  const fallback = defaultSfLeaderboardRange(new Date())

  const { db } = getMongo()
  const snapshot = await computeSfLeaderboard(db, {
    from: from ?? fallback.from,
    to: to ?? fallback.to,
    metric,
  })
  return NextResponse.json(snapshot)
}

