import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  buildAiAssistantPayload,
  type AiAssistantPayload,
} from '@/lib/ai-response'
import {
  buildAiDashboardContext,
  formatAiDashboardContextForPrompt,
} from '@/lib/ai-dashboard-context'
import { GroqConfigError, groqChatCompletion, type GroqChatMessage } from '@/lib/groq'
import { getMongo } from '@/lib/mongodb'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(8000),
      }),
    )
    .min(1)
    .max(24),
  pathname: z.string().max(300).optional(),
})

async function requireSession() {
  await ensureAuthMongo()
  return await auth.api.getSession({
    headers: await headers(),
  })
}

const SYSTEM_PROMPT = `You are GELOS AI, the built-in operations assistant for the GELOS staff platform.

You help staff understand DTC sell-out, retail field activity, B2B payments, inventory health, finance, and assigned tasks.

CRITICAL OUTPUT FORMAT:
Return ONE single JSON object only (never repeat or duplicate the JSON). No markdown fences. No prose outside JSON.

Schema:
{
  "title": "Short headline",
  "summary": "One crisp executive sentence",
  "blocks": [...]
}

Block types:
- stats: { "type": "stats", "items": [{ "label": "Active outlets", "value": "28", "hint": "7d range", "trend": "neutral", "trendText": "Stable" }] }
  IMPORTANT: every stats "value" must be a STRING (e.g. "28", "GHS 27,235.00", not raw numbers).
- progress: { "type": "progress", "label": "Target attainment", "value": 0.5, "max": 100, "format": "percent", "detail": "GHS 27,235 of GHS 12,000,000 MTD" }
  For percentages use format "percent" with value 0-100 (0.5 means 0.5%, 72 means 72%).
- bar_chart / donut: numeric values in items[].value
- alert, bullets, heading, text as before

Content rules:
- Use ONLY numbers from LIVE DASHBOARD CONTEXT. Never invent metrics.
- Currency: GHS with commas (GHS 27,235.00).
- Lead with 3-5 stat cards, then progress for targets, alert for risks, bullets for actions.
- Data sources in context:
  - finance: P&L, revenue mix, COGS %, margins, payment split
  - dtc.dashboard / dtc.marketing / dtc.productPerformance: DTC sell-out, campaigns, top SKUs
  - retail.dashboard / retail.repTargets / retail.leaderboard30d: field KPIs, MTD targets, top reps
  - retail.customerIntelligence: per-outlet balances (countBalanceAboveGhs, topBalances, outletsForQuestion when relevant)
  - retail.b2bPayments30d / retail.b2bPaymentsAllTime: invoice collections and overdue
  - retail.productPerformance: retail/B2B product rollups
  - tasks / teamTasks: assigned rep work (teamTasks for managers)
- For retail customer balance questions use retail.customerIntelligence.countBalanceAboveGhs for the count and retail.customerIntelligence.outletsForQuestion or topBalances for outlet names. Include a bullets block listing outlets (name + balance GHS) when the user asks who/which outlets or to list them.
- For rep ranking use retail.leaderboard30d or retail.repTargets.topRepsBySellIn.
- For marketing ROAS use dtc.marketing.
- Keep copy short. Max 8 blocks.`

export async function POST(request: Request) {
  const session = await requireSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    const json = await request.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const { db } = getMongo()
    const dashboardContext = await buildAiDashboardContext(db, session as any, body.pathname ?? null)
    const history = body.messages.slice(-6)
    const lastUserMessage = history.filter((m) => m.role === 'user').pop()?.content
    const contextBlock = formatAiDashboardContextForPrompt(dashboardContext, lastUserMessage)

    const groqMessages: GroqChatMessage[] = [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT}\n\n--- LIVE DASHBOARD CONTEXT (generated ${dashboardContext.generatedAt}) ---\n${contextBlock}`,
      },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ]

    const reply = await groqChatCompletion({
      messages: groqMessages,
      responseFormat: 'json_object',
      maxTokens: 4096,
    })

    const payload: AiAssistantPayload = buildAiAssistantPayload(
      reply,
      dashboardContext,
      lastUserMessage,
    )

    return NextResponse.json({
      message: {
        role: 'assistant' as const,
        content: payload.displayText,
        structured: payload.structured,
        highlights: payload.highlights,
      },
      contextGeneratedAt: dashboardContext.generatedAt,
    })
  } catch (err) {
    if (err instanceof GroqConfigError) {
      return NextResponse.json(
        { error: 'AI is not configured. Add GROQ_API_KEY to the server environment.' },
        { status: 503 },
      )
    }
    console.error('[ai/chat]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI request failed' },
      { status: 500 },
    )
  }
}
