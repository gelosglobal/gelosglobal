import { auth, ensureAuthMongo } from '@/lib/auth'
import { computeProductPerformance } from '@/lib/dtc-product-performance'
import { getMongo } from '@/lib/mongodb'
import {
  resolveProductPerformanceRange,
  type ProductPerformancePreset,
} from '@/lib/product-performance-range'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

export async function GET(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const preset = (url.searchParams.get('preset') || '7d') as ProductPerformancePreset
  const from = url.searchParams.get('from') || ''
  const to = url.searchParams.get('to') || ''

  const resolved = resolveProductPerformanceRange({ preset, from, to })
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 })
  }

  const { range } = resolved
  const { db } = getMongo()
  const { rows, highlights } = await computeProductPerformance(db, {
    currentStart: range.currentStart,
    currentEnd: range.currentEnd,
  })

  return NextResponse.json({
    rows,
    highlights,
    period: {
      label: range.label,
      currentRangeLabel: range.currentRangeLabel,
      priorRangeLabel: range.priorRangeLabel,
      currentStart: range.currentStart.toISOString(),
      currentEnd: range.currentEnd.toISOString(),
      priorStart: range.priorStart.toISOString(),
      priorEnd: range.priorEnd.toISOString(),
      generatedAt: new Date().toISOString(),
    },
  })
}
