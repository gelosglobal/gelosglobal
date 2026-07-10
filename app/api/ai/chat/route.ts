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
- Lead with 3-4 stat cards, then progress for targets, alert for risks, bullets for actions.
- For retail target questions include MTD sell-in vs monthly target in progress detail.
- Keep copy short. Max 6 blocks.`

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
    const contextBlock = formatAiDashboardContextForPrompt(dashboardContext)

    const history = body.messages.slice(-12)
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
      maxTokens: 3072,
    })

    const payload: AiAssistantPayload = buildAiAssistantPayload(reply, dashboardContext)

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
