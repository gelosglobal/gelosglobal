import { format, subDays, subMonths } from 'date-fns'

export type ProductPerformancePreset = '7d' | '1m' | '3m' | '6m' | '12m' | 'custom'

export type ResolvedProductPerformanceRange = {
  currentStart: Date
  /** Exclusive upper bound for queries: `orderedAt >= start && orderedAt < end`. */
  currentEnd: Date
  priorStart: Date
  priorEnd: Date
  label: string
  currentRangeLabel: string
  priorRangeLabel: string
}

function parseYmdToUtcStart(ymd: string): Date | null {
  const v = (ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function parseYmdToUtcEndExclusive(ymd: string): Date | null {
  const v = (ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const endInclusive = new Date(`${v}T23:59:59.999Z`)
  if (Number.isNaN(endInclusive.getTime())) return null
  return new Date(endInclusive.getTime() + 1)
}

function formatRangeLabel(start: Date, endExclusive: Date): string {
  const endInclusive = new Date(endExclusive.getTime() - 1)
  if (endInclusive.getTime() < start.getTime()) return format(start, 'd MMM yyyy')
  return `${format(start, 'd MMM yyyy')} – ${format(endInclusive, 'd MMM yyyy')}`
}

export function resolveProductPerformanceRange(input: {
  preset: ProductPerformancePreset
  from?: string
  to?: string
  now?: Date
}):
  | { ok: true; range: ResolvedProductPerformanceRange }
  | { ok: false; error: string } {
  const now = input.now ?? new Date()
  let currentEnd = now
  let currentStart = subDays(now, 7)
  let label = 'Last 7 days vs prior 7 days'

  if (input.preset === 'custom') {
    const from = (input.from ?? '').trim()
    const to = (input.to ?? '').trim()
    if (!from || !to) {
      return { ok: false, error: 'Pick both start and end dates for a custom range' }
    }
    const s = parseYmdToUtcStart(from)
    const e = parseYmdToUtcEndExclusive(to)
    if (!s || !e || e.getTime() <= s.getTime()) {
      return { ok: false, error: 'Invalid date range' }
    }
    currentStart = s
    currentEnd = e
    label = `Custom (${from} → ${to}) vs prior period of equal length`
  } else if (input.preset === '1m') {
    currentStart = subMonths(now, 1)
    label = 'Last 1 month vs prior month'
  } else if (input.preset === '3m') {
    currentStart = subMonths(now, 3)
    label = 'Last 3 months vs prior 3 months'
  } else if (input.preset === '6m') {
    currentStart = subMonths(now, 6)
    label = 'Last 6 months vs prior 6 months'
  } else if (input.preset === '12m') {
    currentStart = subMonths(now, 12)
    label = 'Last 12 months vs prior 12 months'
  } else {
    label = 'Last 7 days vs prior 7 days'
  }

  const windowMs = Math.max(0, currentEnd.getTime() - currentStart.getTime())
  const priorEnd = currentStart
  const priorStart = new Date(priorEnd.getTime() - windowMs)

  return {
    ok: true,
    range: {
      currentStart,
      currentEnd,
      priorStart,
      priorEnd,
      label,
      currentRangeLabel: formatRangeLabel(currentStart, currentEnd),
      priorRangeLabel: formatRangeLabel(priorStart, priorEnd),
    },
  }
}

export function defaultCustomRangeYmd(): { from: string; to: string } {
  const to = new Date()
  const from = subDays(to, 6)
  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(to, 'yyyy-MM-dd'),
  }
}
