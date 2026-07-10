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

export function enrichStructuredResponse(
  structured: AiStructuredResponse,
  context: AiDashboardContext,
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

  return { ...structured, blocks }
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

export function buildAiContextHighlights(context: AiDashboardContext): AiContextHighlight[] {
  const highlights: AiContextHighlight[] = []

  const finance = asRecord(context.finance)
  if (finance) {
    const total = asNumber(finance.totalRevenue)
    const dtc = asNumber(finance.dtcRevenue)
    const b2b = asNumber(finance.b2bCollected)
    const outstanding = asNumber(finance.b2bOutstandingGhs)
    if (total !== null) {
      highlights.push({
        id: 'finance-total',
        label: 'Total revenue',
        value: formatGhs(total),
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

  const dtc = asRecord(context.dtc)
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

  return highlights.slice(0, 6)
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
): AiAssistantPayload {
  const parsed = parseAiStructuredResponse(raw)
  const structured = enrichStructuredResponse(parsed, context)
  return {
    structured,
    highlights: buildAiContextHighlights(context),
    displayText: buildDisplayText(structured),
    raw,
  }
}

export { normalizeProgressValue }
