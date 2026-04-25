import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeProductPerformance } from '@/lib/dtc-product-performance'
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

type Preset = '7d' | '1m' | '3m' | '6m' | '12m' | 'custom'

function parseYmdToUtcStart(ymd: string): Date | null {
  const v = (ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseYmdToUtcEnd(ymd: string): Date | null {
  const v = (ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T23:59:59.999Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function subMonthsClamped(d: Date, months: number) {
  const copy = new Date(d)
  const m = copy.getUTCMonth() - months
  copy.setUTCMonth(m)
  return copy
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const preset = (url.searchParams.get('preset') || '7d') as Preset
  const from = url.searchParams.get('from') || ''
  const to = url.searchParams.get('to') || ''

  const now = new Date()
  let currentEnd = now
  let currentStart: Date = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  let label = 'Last 7 days vs prior 7 days'

  if (preset === 'custom') {
    const s = parseYmdToUtcStart(from)
    const e = parseYmdToUtcEnd(to)
    if (!s || !e || e.getTime() < s.getTime()) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }
    currentStart = s
    // end is inclusive end-of-day; for half-open [start, end) queries we bump 1ms.
    currentEnd = new Date(e.getTime() + 1)
    label = `Custom range (${from} → ${to}) vs prior period`
  } else if (preset === '1m') {
    currentStart = subMonthsClamped(now, 1)
    label = 'Last 1 month vs prior period'
  } else if (preset === '3m') {
    currentStart = subMonthsClamped(now, 3)
    label = 'Last 3 months vs prior period'
  } else if (preset === '6m') {
    currentStart = subMonthsClamped(now, 6)
    label = 'Last 6 months vs prior period'
  } else if (preset === '12m') {
    currentStart = subMonthsClamped(now, 12)
    label = 'Last 12 months vs prior period'
  } else {
    // default '7d'
    currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    label = ''
  }

  const { db } = getMongo()
  const { rows, highlights } = await computeProductPerformance(db, { currentStart, currentEnd })
  return NextResponse.json({
    rows,
    highlights,
    period: {
      label,
      generatedAt: new Date().toISOString(),
    },
  })
}
