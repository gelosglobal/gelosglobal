import { auth, ensureAuthMongo } from '@/lib/auth'
import {
  buildAiAssistantPayload,
  type AiAssistantPayload,
} from '@/lib/ai-response'
import {
  buildAiDashboardContext,
  estimateAiPromptContextTokens,
  formatAiDashboardContextForPrompt,
} from '@/lib/ai-dashboard-context'
import {
  AI_PROMPT_MAX_ASSISTANT_CHARS,
  AI_PROMPT_MAX_HISTORY_MESSAGES,
  estimateTokens,
} from '@/lib/ai-context-intent'
import { AI_SYSTEM_PROMPT } from '@/lib/ai-system-prompt'
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

function isGroqTokenBudgetError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : ''
  return (
    msg.includes('rate limit') ||
    msg.includes('request too large') ||
    msg.includes('tokens per minute') ||
    msg.includes('tpm')
  )
}

function trimChatHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  return messages.slice(-AI_PROMPT_MAX_HISTORY_MESSAGES).map((m) => {
    if (m.role === 'assistant' && m.content.length > AI_PROMPT_MAX_ASSISTANT_CHARS) {
      return {
        ...m,
        content: `${m.content.slice(0, AI_PROMPT_MAX_ASSISTANT_CHARS)}…`,
      }
    }
    return m
  })
}

function buildGroqMessages(
  dashboardContext: Awaited<ReturnType<typeof buildAiDashboardContext>>,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  lastUserMessage: string | undefined,
  opts?: { minimal?: boolean },
): GroqChatMessage[] {
  const contextBlock = formatAiDashboardContextForPrompt(
    dashboardContext,
    lastUserMessage,
    opts,
  )
  return [
    {
      role: 'system',
      content: `${AI_SYSTEM_PROMPT}\n\n--- LIVE DASHBOARD CONTEXT (${dashboardContext.generatedAt}) ---\n${contextBlock}`,
    },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ]
}

function estimateGroqRequestTokens(messages: GroqChatMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

async function requestGroqReply(
  dashboardContext: Awaited<ReturnType<typeof buildAiDashboardContext>>,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  lastUserMessage: string | undefined,
): Promise<string> {
  let messages = buildGroqMessages(dashboardContext, history, lastUserMessage)
  const contextTokens = estimateAiPromptContextTokens(dashboardContext, lastUserMessage)
  const requestTokens = estimateGroqRequestTokens(messages)
  console.info('[ai/chat] token estimate', {
    contextTokens,
    requestTokens,
    historyMessages: history.length,
  })

  try {
    return await groqChatCompletion({
      messages,
      responseFormat: 'json_object',
      maxTokens: 1536,
    })
  } catch (err) {
    if (!isGroqTokenBudgetError(err)) throw err

    console.warn('[ai/chat] token budget exceeded, retrying with minimal context', {
      contextTokens,
      requestTokens,
      error: err instanceof Error ? err.message : err,
    })

    messages = buildGroqMessages(dashboardContext, history, lastUserMessage, { minimal: true })
    const retryTokens = estimateGroqRequestTokens(messages)
    console.info('[ai/chat] minimal retry token estimate', { retryTokens })

    return await groqChatCompletion({
      messages,
      responseFormat: 'json_object',
      maxTokens: 1024,
    })
  }
}

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
    const history = trimChatHistory(body.messages)
    const lastUserMessage = history.filter((m) => m.role === 'user').pop()?.content

    const reply = await requestGroqReply(dashboardContext, history, lastUserMessage)

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
