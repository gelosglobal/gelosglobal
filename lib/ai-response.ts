import { z } from 'zod'
import type { AiDashboardContext } from '@/lib/ai-dashboard-context'
import { formatGhs } from '@/lib/dtc-orders'

const looseStatItemSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  hint: z.string().optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional(),
  trendText: z.string().optional(),
})

const looseChartItemSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
})

const looseBlockSchema = z
  .object({
    type: z.string(),
  })
  .passthrough()

const looseResponseSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  blocks: z.array(looseBlockSchema).optional(),
})

const statItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  hint: z.string().optional(),
  trend: z.enum(['up', 'down', 'neutral']).optional(),
  trendText: z.string().optional(),
})

const chartItemSchema = z.object({
  label: z.string(),
  value: z.number(),
})

const blockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string(),
    level: z.union([z.literal(2), z.literal(3)]).optional(),
  }),
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({
    type: z.literal('stats'),
    items: z.array(statItemSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal('progress'),
    label: z.string(),
    value: z.number(),
    max: z.number().optional(),
    suffix: z.string().optional(),
    format: z.enum(['percent', 'ratio', 'currency']).optional(),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal('bar_chart'),
    title: z.string().optional(),
    items: z.array(chartItemSchema).min(1).max(8),
  }),
  z.object({
    type: z.literal('donut'),
    title: z.string().optional(),
    items: z.array(chartItemSchema).min(1).max(6),
  }),
  z.object({
    type: z.literal('alert'),
    severity: z.enum(['high', 'medium', 'low']),
    title: z.string(),
    body: z.string().optional(),
  }),
  z.object({
    type: z.literal('bullets'),
    title: z.string().optional(),
    items: z.array(z.string()).min(1).max(12),
  }),
])

export const aiStructuredResponseSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  blocks: z.array(blockSchema).min(1).max(24),
})

export type AiResponseBlock = z.infer<typeof blockSchema>
export type AiStructuredResponse = z.infer<typeof aiStructuredResponseSchema>

export type AiContextHighlight = {
  id: string
  label: string
  value: string
  hint?: string
  trend?: 'up' | 'down' | 'neutral'
  trendText?: string
}

export type AiAssistantPayload = {
  structured: AiStructuredResponse
  highlights: AiContextHighlight[]
  displayText: string
  raw: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function formatStatValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return value.toLocaleString('en-GH')
    return value.toLocaleString('en-GH', { maximumFractionDigits: 2 })
  }
  return String(value ?? '—')
}

function extractJsonObjects(raw: string): string[] {
  const text = raw.trim()
  const objects: string[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  return objects
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const objects = extractJsonObjects(trimmed)
  if (objects.length > 0) return objects[0]

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

function normalizeProgressValue(
  value: number,
  max: number,
  format?: 'percent' | 'ratio' | 'currency',
): { pct: number; display: string } {
  if (format === 'percent') {
    const pct = Math.min(100, Math.max(0, value))
    return { pct, display: `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%` }
  }

  // Heuristic: model often sends 0.5 meaning 0.5% when max is 100
  if (max === 100 && value > 0 && value <= 1) {
    const pct = Math.min(100, value)
    return { pct, display: `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%` }
  }

  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  if (format === 'currency') {
    return { pct, display: `${formatGhs(value)} / ${formatGhs(max)}` }
  }
  return { pct, display: `${pct}%` }
}

function normalizeBlock(raw: Record<string, unknown>): AiResponseBlock | null {
  const type = String(raw.type ?? '').trim()

  if (type === 'heading') {
    const text = String(raw.text ?? '').trim()
    if (!text) return null
    const level = raw.level === 3 ? 3 : 2
    return { type: 'heading', text, level }
  }

  if (type === 'text') {
    const text = String(raw.text ?? '').trim()
    if (!text) return null
    return { type: 'text', text }
  }

  if (type === 'stats') {
    const itemsRaw = Array.isArray(raw.items) ? raw.items : []
    const items = itemsRaw
      .map((item) => {
        const row = asRecord(item)
        if (!row || !row.label) return null
        const parsed = looseStatItemSchema.safeParse(row)
        if (!parsed.success) return null
        return {
          label: parsed.data.label.trim(),
          value: formatStatValue(parsed.data.value),
          hint: parsed.data.hint?.trim(),
          trend: parsed.data.trend,
          trendText: parsed.data.trendText?.trim(),
        }
      })
      .filter(Boolean) as z.infer<typeof statItemSchema>[]
    if (items.length === 0) return null
    return { type: 'stats', items }
  }

  if (type === 'progress') {
    const label = String(raw.label ?? '').trim()
    const value = asNumber(raw.value)
    if (!label || value === null) return null
    const max = asNumber(raw.max) ?? 100
    const format =
      raw.format === 'percent' || raw.format === 'ratio' || raw.format === 'currency'
        ? raw.format
        : undefined
    return {
      type: 'progress',
      label,
      value,
      max,
      suffix: typeof raw.suffix === 'string' ? raw.suffix : undefined,
      format,
      detail: typeof raw.detail === 'string' ? raw.detail.trim() : undefined,
    }
  }

  if (type === 'bar_chart' || type === 'donut') {
    const itemsRaw = Array.isArray(raw.items) ? raw.items : []
    const items = itemsRaw
      .map((item) => {
        const row = asRecord(item)
        if (!row || !row.label) return null
        const parsed = looseChartItemSchema.safeParse(row)
        if (!parsed.success) return null
        const value = asNumber(parsed.data.value)
        if (value === null) return null
        return { label: parsed.data.label.trim(), value }
      })
      .filter(Boolean) as z.infer<typeof chartItemSchema>[]
    if (items.length === 0) return null
    return {
      type,
      title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
      items,
    } as AiResponseBlock
  }

  if (type === 'alert') {
    const title = String(raw.title ?? '').trim()
    if (!title) return null
    const severity =
      raw.severity === 'high' || raw.severity === 'medium' || raw.severity === 'low'
        ? raw.severity
        : 'medium'
    return {
      type: 'alert',
      severity,
      title,
      body: typeof raw.body === 'string' ? raw.body.trim() : undefined,
    }
  }

  if (type === 'bullets') {
    const items = (Array.isArray(raw.items) ? raw.items : [])
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
    if (items.length === 0) return null
    return {
      type: 'bullets',
      title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
      items,
    }
  }

  return null
}

function looksLikeJsonDump(text: string): boolean {
  const t = text.trim()
  return t.startsWith('{') && t.includes('"blocks"')
}

type BalanceOutletRow = {
  outletName: string
  balanceGhs: number
}

function parseBalanceThresholdGhs(text: string): number | null {
  const t = text.toLowerCase()
  if (!/(balance|outstanding|receivable|owe|debt|collect|outlet)/i.test(t)) return null

  const kMatch = t.match(/(\d+(?:\.\d+)?)\s*k\b/)
  if (kMatch) {
    const n = parseFloat(kMatch[1])
    return Number.isFinite(n) ? Math.round(n * 1000) : null
  }

  const patterns = [
    /(?:above|over|more than|greater than|>)\s*(?:ghs\s*)?([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*ghs/i,
    /(?:above|over|more than)\s*([\d,]+(?:\.\d+)?)/i,
  ]
  for (const pattern of patterns) {
    const m = t.match(pattern)
    if (!m) continue
    const n = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return null
}

function resolveOutletsAboveThreshold(
  lists: Record<string, unknown> | null,
  thresholdGhs: number,
): BalanceOutletRow[] {
  if (!lists) return []

  const mapRows = (raw: unknown): BalanceOutletRow[] => {
    if (!Array.isArray(raw)) return []
    return raw
      .map((row) => {
        const r = asRecord(row)
        if (!r || typeof r.outletName !== 'string') return null
        const balanceGhs = asNumber(r.balanceGhs)
        if (balanceGhs === null) return null
        return { outletName: r.outletName, balanceGhs }
      })
      .filter(Boolean) as BalanceOutletRow[]
  }

  const exact = mapRows(lists[String(thresholdGhs)])
  if (exact.length > 0 || lists[String(thresholdGhs)] != null) {
    return exact
  }

  const keys = Object.keys(lists)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  let useKey = keys[0]
  for (const n of keys) {
    if (n <= thresholdGhs) useKey = n
  }
  return mapRows(lists[String(useKey)]).filter((r) => r.balanceGhs > thresholdGhs)
}

function injectBalanceOutletList(
  structured: AiStructuredResponse,
  context: AiDashboardContext,
  userMessage?: string,
): AiStructuredResponse {
  const threshold = userMessage ? parseBalanceThresholdGhs(userMessage) : null
  if (threshold === null) return structured

  const retail = asRecord(context.retail)
  const ci = asRecord(retail?.customerIntelligence)
  const lists = asRecord(ci?.outletsAboveBalanceGhs)
  const outlets = resolveOutletsAboveThreshold(lists, threshold)
  if (outlets.length === 0) return structured

  const hasOutletList = structured.blocks.some(
    (b) =>
      b.type === 'bullets' &&
      b.items.some((item) => outlets.some((o) => item.includes(o.outletName))),
  )
  if (hasOutletList) return structured

  const blocks = [
    ...structured.blocks,
    {
      type: 'bullets' as const,
      title: `Outlets with balance above ${formatGhs(threshold)}`,
      items: outlets.map((o) => `${o.outletName} — ${formatGhs(o.balanceGhs)}`),
    },
  ]

  return { ...structured, blocks }
}

export function enrichStructuredResponse(
  structured: AiStructuredResponse,
  context: AiDashboardContext,
  userMessage?: string,
): AiStructuredResponse {
  const retail = asRecord(context.retail)
  const retailDash = asRecord(retail?.dashboard)
  const retailKpis = asRecord(retailDash?.kpis)
  const finance = asRecord(context.finance)

  const attainment = asNumber(retailKpis?.targetAttainmentPct)
  const mtdSellIn = asNumber(retailKpis?.mtdSellInGhs)
  const monthlyTarget = asNumber(retailKpis?.monthlyTargetGhs)
  const outstanding = asNumber(finance?.b2bOutstandingGhs)

  const blocks = structured.blocks.map((block) => {
    if (block.type !== 'progress') return block

    const label = block.label.toLowerCase()
    if (attainment !== null && (label.includes('target') || label.includes('attainment'))) {
      return {
        ...block,
        format: 'percent' as const,
        value: attainment,
        max: 100,
        detail:
          mtdSellIn !== null && monthlyTarget !== null
            ? `${formatGhs(mtdSellIn)} of ${formatGhs(monthlyTarget)} MTD`
            : block.detail,
      }
    }

    return block
  })

  // Patch alert for outstanding if model got it wrong or missing
  const hasOutstandingAlert = blocks.some(
    (b) =>
      b.type === 'alert' &&
      b.title.toLowerCase().includes('receivable'),
  )
  if (!hasOutstandingAlert && outstanding !== null && outstanding > 0) {
    blocks.push({
      type: 'alert',
      severity: 'high',
      title: 'Outstanding B2B receivables',
      body: `${formatGhs(outstanding)} awaiting collection`,
    })
  }

  const withOutlets = injectBalanceOutletList(
    { ...structured, blocks },
    context,
    userMessage,
  )
  return withOutlets
}

export function parseAiStructuredResponse(raw: string): AiStructuredResponse {
  const candidates = [
    extractJsonCandidate(raw),
    ...extractJsonObjects(raw),
  ].filter((c, i, arr) => c && arr.indexOf(c) === i)

  for (const candidate of candidates) {
    try {
      const json = JSON.parse(candidate)
      const loose = looseResponseSchema.safeParse(json)
      if (!loose.success) continue

      const blocks = (loose.data.blocks ?? [])
        .map((b) => normalizeBlock(b as Record<string, unknown>))
        .filter(Boolean) as AiResponseBlock[]

      if (blocks.length === 0) continue

      const structured: AiStructuredResponse = {
        title: loose.data.title?.trim() || undefined,
        summary: loose.data.summary?.trim() || undefined,
        blocks,
      }

      const validated = aiStructuredResponseSchema.safeParse(structured)
      if (validated.success) return validated.data
      return structured
    } catch {
      // try next candidate
    }
  }

  const trimmed = raw.trim()
  if (looksLikeJsonDump(trimmed)) {
    return {
      title: 'Insight',
      summary: 'Could not render this response. Please try asking again.',
      blocks: [
        {
          type: 'alert',
          severity: 'medium',
          title: 'Formatting issue',
          body: 'The AI returned data in an unexpected format. Your metrics snapshot is still shown below.',
        },
      ],
    }
  }

  return {
    title: 'Insight',
    summary: trimmed,
    blocks: [{ type: 'text', text: trimmed }],
  }
}

export function buildAiContextHighlights(
  context: AiDashboardContext,
  opts?: {
    userMessage?: string
    structured?: AiStructuredResponse
    limit?: number
  },
): AiContextHighlight[] {
  const candidates = collectAiContextHighlightCandidates(context, opts?.userMessage)
  return rankAiContextHighlights(candidates, context, opts).slice(0, opts?.limit ?? 4)
}

const HIGHLIGHT_TOPIC_PATTERNS: Record<string, RegExp[]> = {
  'retail-balance-threshold': [
    /balance|outstanding|receivable|owe|debt|collect|ghs|above|over/i,
    /outlet|customer|retail/i,
  ],
  'retail-balance-total': [/balance|outstanding|receivable|owe|debt|collect/i],
  'retail-b2b-overdue': [/overdue|late|past due|collect|receivable/i],
  'retail-at-risk': [/at risk|risk|churn|inactive|stale/i],
  'retail-outlets': [/outlet|customer|retail|store|shop/i],
  'retail-target': [/target|attainment|quota|goal|mtd/i],
  'retail-mtd-sellin': [/sell.?in|revenue|sales|trade/i],
  'retail-visits': [/visit|field|coverage|shop visit/i],
  'retail-team-target': [/target|team|rep|quota|attainment/i],
  'retail-top-rep': [/leaderboard|top rep|best rep|ranking|rep/i],
  'finance-total': [/revenue|profit|p&l|finance|sales|total/i],
  'finance-net-profit': [/profit|p&l|margin|net|bottom line/i],
  'finance-gross-margin': [/gross|margin|cogs|profit/i],
  'finance-mix': [/dtc|b2b|mix|channel|split/i],
  'finance-outstanding': [/outstanding|receivable|collect|balance|b2b/i],
  'dtc-roas': [/marketing|roas|campaign|ad|spend|attribution/i],
  'dtc-revenue': [/dtc|revenue|sell.?out|direct/i],
  'dtc-orders': [/order|dtc|fulfillment/i],
  'dtc-below-safety': [/inventory|stock|safety|sku|restock|warehouse/i],
  'inventory-critical': [/inventory|stock|critical|restock|warehouse/i],
  'inventory-low': [/inventory|stock|low|restock|warehouse/i],
  'tasks-open': [/task|todo|assigned|my work/i],
  'team-tasks-open': [/task|team|rep task|assign/i],
}

const DEFAULT_HIGHLIGHT_PRIORITY = [
  'finance-total',
  'retail-mtd-sellin',
  'retail-target',
  'dtc-revenue',
  'retail-balance-total',
  'inventory-critical',
]

function collectAiContextHighlightCandidates(
  context: AiDashboardContext,
  userMessage?: string,
): AiContextHighlight[] {
  const highlights: AiContextHighlight[] = []
  const balanceThreshold = userMessage ? parseBalanceThresholdGhs(userMessage) : null

  const finance = asRecord(context.finance)
  if (finance) {
    const total = asNumber(finance.totalRevenue)
    const dtc = asNumber(finance.dtcRevenue)
    const b2b = asNumber(finance.b2bCollected)
    const outstanding = asNumber(finance.b2bOutstandingGhs)
    const netProfit = asNumber(finance.netProfit)
    const grossMarginPct = asNumber(finance.grossMarginPct)
    if (total !== null) {
      highlights.push({
        id: 'finance-total',
        label: 'Total revenue',
        value: formatGhs(total),
        hint: `${finance.periodDays ?? 30}d`,
      })
    }
    if (netProfit !== null) {
      highlights.push({
        id: 'finance-net-profit',
        label: 'Net profit',
        value: formatGhs(netProfit),
        hint: `${finance.periodDays ?? 30}d`,
        trend: netProfit >= 0 ? 'up' : 'down',
      })
    }
    if (grossMarginPct !== null) {
      highlights.push({
        id: 'finance-gross-margin',
        label: 'Gross margin',
        value: `${grossMarginPct}%`,
        hint: `${finance.periodDays ?? 30}d`,
      })
    }
    if (dtc !== null && b2b !== null && total && total > 0) {
      highlights.push({
        id: 'finance-mix',
        label: 'DTC vs B2B',
        value: `${Math.round((dtc / total) * 100)}% / ${Math.round((b2b / total) * 100)}%`,
        hint: 'Collected mix',
      })
    }
    if (outstanding !== null && outstanding > 0) {
      highlights.push({
        id: 'finance-outstanding',
        label: 'B2B outstanding',
        value: formatGhs(outstanding),
        trend: 'down',
        trendText: 'Collect',
      })
    }
  }

  const retail = asRecord(context.retail)
  const retailDash = asRecord(retail?.dashboard)
  const retailKpis = asRecord(retailDash?.kpis)
  if (retailKpis) {
    const attainment = asNumber(retailKpis.targetAttainmentPct)
    const mtdSellIn = asNumber(retailKpis.mtdSellInGhs)
    const visits = asNumber(retailKpis.visits)
    if (attainment !== null) {
      highlights.push({
        id: 'retail-target',
        label: 'Retail target',
        value: `${attainment < 10 ? attainment.toFixed(1) : Math.round(attainment)}%`,
        hint: 'MTD attainment',
        trend: attainment >= 100 ? 'up' : attainment >= 70 ? 'neutral' : 'down',
      })
    }
    if (mtdSellIn !== null) {
      highlights.push({
        id: 'retail-mtd-sellin',
        label: 'MTD sell-in',
        value: formatGhs(mtdSellIn),
      })
    }
    if (visits !== null) {
      highlights.push({
        id: 'retail-visits',
        label: 'Field visits',
        value: String(Math.round(visits)),
        hint: 'Selected range',
      })
    }
  }

  const customerIntel = asRecord(retail?.customerIntelligence)
  if (customerIntel) {
    const totalBalance = asNumber(customerIntel.totalBalanceGhs)
    const withBalance = asNumber(customerIntel.outletsWithBalance)
    const totalOutlets = asNumber(customerIntel.totalOutlets)
    const segments = asRecord(customerIntel.segments)
    const atRisk = asNumber(segments?.atRisk)

    if (balanceThreshold !== null) {
      const count = asNumber(
        asRecord(customerIntel.countBalanceAboveGhs)?.[String(balanceThreshold)],
      )
      if (count !== null) {
        highlights.push({
          id: 'retail-balance-threshold',
          label: `Balance > ${formatGhs(balanceThreshold)}`,
          value: String(Math.round(count)),
          hint: 'Retail outlets',
          trend: count > 0 ? 'down' : 'neutral',
          trendText: count > 0 ? 'Collect' : 'None',
        })
      }
    } else if (withBalance !== null && withBalance > 0 && totalBalance !== null) {
      highlights.push({
        id: 'retail-balance-total',
        label: 'Retail receivables',
        value: formatGhs(totalBalance),
        hint: `${Math.round(withBalance)} outlets`,
        trend: 'down',
        trendText: 'Collect',
      })
    }

    if (atRisk !== null && atRisk > 0) {
      highlights.push({
        id: 'retail-at-risk',
        label: 'At-risk outlets',
        value: String(Math.round(atRisk)),
        hint: '60d+ no invoice',
        trend: 'down',
      })
    }

    if (totalOutlets !== null && totalOutlets > 0) {
      highlights.push({
        id: 'retail-outlets',
        label: 'Retail outlets',
        value: String(Math.round(totalOutlets)),
        hint: 'On file',
      })
    }
  }

  const b2b30 = asRecord(retail?.b2bPayments30d)
  const overdue30 = asNumber(b2b30?.overdueGhs)
  if (overdue30 !== null && overdue30 > 0) {
    highlights.push({
      id: 'retail-b2b-overdue',
      label: 'B2B overdue',
      value: formatGhs(overdue30),
      hint: 'Last 30d',
      trend: 'down',
      trendText: 'Collect',
    })
  }

  const repTargets = asRecord(retail?.repTargets)
  if (repTargets) {
    const teamAttainment = asNumber(repTargets.teamSellInAttainmentPct)
    if (teamAttainment !== null) {
      highlights.push({
        id: 'retail-team-target',
        label: 'Team sell-in',
        value: `${teamAttainment < 10 ? teamAttainment.toFixed(1) : Math.round(teamAttainment)}%`,
        hint: 'MTD vs quota',
        trend: teamAttainment >= 100 ? 'up' : teamAttainment >= 70 ? 'neutral' : 'down',
      })
    }
  }

  const leaderboard = asRecord(retail?.leaderboard30d)
  const topReps = Array.isArray(leaderboard?.topReps) ? leaderboard.topReps : []
  const topRep = asRecord(topReps[0])
  if (topRep && typeof topRep.rep === 'string') {
    const sellIn = asNumber(topRep.sellInGhs)
    highlights.push({
      id: 'retail-top-rep',
      label: 'Top rep (30d)',
      value: sellIn !== null ? formatGhs(sellIn) : topRep.rep,
      hint: topRep.rep,
      trend: 'up',
    })
  }

  const dtc = asRecord(context.dtc)
  const marketing = asRecord(dtc?.marketing)
  if (marketing) {
    const roas = asNumber(marketing.blendedRoas)
    if (roas !== null && roas > 0) {
      highlights.push({
        id: 'dtc-roas',
        label: 'Blended ROAS',
        value: `${roas.toFixed(2)}x`,
        hint: `${marketing.periodDays ?? 30}d`,
        trend: roas >= 2 ? 'up' : roas >= 1 ? 'neutral' : 'down',
      })
    }
  }

  const dtcDash = asRecord(dtc?.dashboard)
  const dtcKpis = asRecord(dtcDash?.kpis)
  if (dtcKpis) {
    const revenue = asNumber(dtcKpis.revenueGhs)
    const orders = asNumber(dtcKpis.orders)
    const belowSafety = asNumber(dtcKpis.belowSafety)
    if (revenue !== null) {
      highlights.push({
        id: 'dtc-revenue',
        label: 'DTC revenue',
        value: formatGhs(revenue),
      })
    }
    if (orders !== null) {
      highlights.push({
        id: 'dtc-orders',
        label: 'DTC orders',
        value: String(Math.round(orders)),
      })
    }
    if (belowSafety !== null && belowSafety > 0) {
      highlights.push({
        id: 'dtc-below-safety',
        label: 'Below safety',
        value: String(Math.round(belowSafety)),
        hint: 'SKUs',
        trend: 'down',
        trendText: 'Restock',
      })
    }
  }

  const dtcInv = asRecord(dtc?.inventory)
  const retailInv = asRecord(retail?.inventory)
  const critical =
    (asNumber(dtcInv?.critical) ?? 0) + (asNumber(retailInv?.critical) ?? 0)
  const low = (asNumber(dtcInv?.low) ?? 0) + (asNumber(retailInv?.low) ?? 0)
  if (critical > 0) {
    highlights.push({
      id: 'inventory-critical',
      label: 'Critical stock',
      value: String(critical),
      hint: 'SKUs',
      trend: 'down',
    })
  } else if (low > 0) {
    highlights.push({
      id: 'inventory-low',
      label: 'Low stock',
      value: String(low),
      hint: 'SKUs',
      trend: 'neutral',
    })
  }

  const openTasks =
    context.tasks?.filter((t) => t.status !== 'done' && t.status !== 'completed').length ?? 0
  if (openTasks > 0) {
    highlights.push({
      id: 'tasks-open',
      label: 'Open tasks',
      value: String(openTasks),
      trend: openTasks > 5 ? 'down' : 'neutral',
    })
  }

  const teamOpen =
    context.teamTasks?.filter((t) => t.status !== 'done' && t.status !== 'completed').length ?? 0
  if (teamOpen > 0) {
    highlights.push({
      id: 'team-tasks-open',
      label: 'Team open tasks',
      value: String(teamOpen),
      trend: teamOpen > 5 ? 'down' : 'neutral',
    })
  }

  return highlights
}

function structuredResponseText(structured?: AiStructuredResponse): string {
  if (!structured) return ''
  const parts: string[] = []
  if (structured.title) parts.push(structured.title)
  if (structured.summary) parts.push(structured.summary)
  for (const block of structured.blocks) {
    if (block.type === 'stats') {
      for (const item of block.items) {
        parts.push(item.label, item.value, item.hint ?? '', item.trendText ?? '')
      }
    } else if (block.type === 'text') {
      parts.push(block.text)
    } else if (block.type === 'alert') {
      parts.push(block.title, block.body ?? '')
    } else if (block.type === 'bullets') {
      parts.push(block.title ?? '', ...block.items)
    } else if (block.type === 'progress') {
      parts.push(block.label, block.detail ?? '')
    }
  }
  return parts.join(' ').toLowerCase()
}

function rankAiContextHighlights(
  candidates: AiContextHighlight[],
  context: AiDashboardContext,
  opts?: {
    userMessage?: string
    structured?: AiStructuredResponse
  },
): AiContextHighlight[] {
  if (candidates.length === 0) return []

  const query = (opts?.userMessage ?? '').toLowerCase()
  const responseText = structuredResponseText(opts?.structured)
  const page = (context.currentPage ?? '').toLowerCase()

  const scored = candidates.map((highlight) => {
    let score = 0
    const patterns = HIGHLIGHT_TOPIC_PATTERNS[highlight.id] ?? []

    for (const pattern of patterns) {
      if (query && pattern.test(query)) score += 12
      if (page && pattern.test(page)) score += 4
    }

    const label = highlight.label.toLowerCase()
    const value = highlight.value.toLowerCase()
    if (query && label.split(/\s+/).some((w) => w.length > 3 && query.includes(w))) score += 6
    if (responseText.includes(value) && value.length > 1) score -= 8
    if (responseText.includes(label)) score -= 4

    if (highlight.trend === 'down') score += 1

    const defaultIdx = DEFAULT_HIGHLIGHT_PRIORITY.indexOf(highlight.id)
    if (defaultIdx >= 0) score += 3 - defaultIdx * 0.25

    return { highlight, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const positive = scored.filter((s) => s.score > 0)
  const ordered =
    positive.length > 0
      ? positive
      : [...scored].sort((a, b) => {
          const ai = DEFAULT_HIGHLIGHT_PRIORITY.indexOf(a.highlight.id)
          const bi = DEFAULT_HIGHLIGHT_PRIORITY.indexOf(b.highlight.id)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })

  const seen = new Set<string>()
  const result: AiContextHighlight[] = []
  for (const { highlight } of ordered) {
    if (seen.has(highlight.id)) continue
    seen.add(highlight.id)
    result.push(highlight)
  }
  return result
}

export function buildDisplayText(structured: AiStructuredResponse): string {
  const parts: string[] = []
  if (structured.title) parts.push(structured.title)
  if (structured.summary) parts.push(structured.summary)
  return parts.join(' — ') || 'GELOS AI insight'
}

export function buildAiAssistantPayload(
  raw: string,
  context: AiDashboardContext,
  userMessage?: string,
): AiAssistantPayload {
  const parsed = parseAiStructuredResponse(raw)
  const structured = enrichStructuredResponse(parsed, context, userMessage)
  return {
    structured,
    highlights: buildAiContextHighlights(context, { userMessage, structured }),
    displayText: buildDisplayText(structured),
    raw,
  }
}

export { normalizeProgressValue }
