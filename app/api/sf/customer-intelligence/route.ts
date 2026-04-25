import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeRetailCustomerIntelligence } from '@/lib/sf-customer-intelligence'
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

type Preset = 'all' | '7d' | '1m' | '3m' | '6m' | '12m' | 'custom'

function parseYmdToUtcStart(ymd: string): Date | null {
  const v = (ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseYmdToUtcEndExclusive(ymd: string): Date | null {
  const v = (ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T23:59:59.999Z`)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getTime() + 1)
}

function subMonthsUtc(d: Date, months: number) {
  const copy = new Date(d)
  copy.setUTCMonth(copy.getUTCMonth() - months)
  return copy
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const preset = (url.searchParams.get('preset') || 'all') as Preset
  const from = url.searchParams.get('from') || ''
  const to = url.searchParams.get('to') || ''

  const now = new Date()
  let since: Date | undefined = undefined
  let until: Date | undefined = undefined

  if (preset === 'custom') {
    const s = parseYmdToUtcStart(from)
    const e = parseYmdToUtcEndExclusive(to)
    if (!s || !e || e.getTime() < s.getTime()) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
    }
    since = s
    until = e
  } else if (preset === '7d') {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    until = now
  } else if (preset === '1m') {
    since = subMonthsUtc(now, 1)
    until = now
  } else if (preset === '3m') {
    since = subMonthsUtc(now, 3)
    until = now
  } else if (preset === '6m') {
    since = subMonthsUtc(now, 6)
    until = now
  } else if (preset === '12m') {
    since = subMonthsUtc(now, 12)
    until = now
  } else {
    // 'all'
    since = undefined
    until = undefined
  }

  const { db } = getMongo()
  const { rows, segments } = await computeRetailCustomerIntelligence(db, { since, until })
  return NextResponse.json({
    rows,
    segments,
    generatedAt: new Date().toISOString(),
  })
}

