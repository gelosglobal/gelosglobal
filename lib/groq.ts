export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class GroqConfigError extends Error {
  constructor(message = 'GROQ_API_KEY is not configured') {
    super(message)
    this.name = 'GroqConfigError'
  }
}

export async function groqChatCompletion(params: {
  messages: GroqChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json_object' | 'text'
}): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim()
  if (!apiKey) throw new GroqConfigError()

  const model = params.model ?? process.env.GROQ_MODEL?.trim() ?? 'llama-3.3-70b-versatile'

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.25,
      max_tokens: params.maxTokens ?? 2048,
      ...(params.responseFormat === 'json_object'
        ? { response_format: { type: 'json_object' } }
        : {}),
    }),
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(err.error?.message ?? `Groq request failed (${res.status})`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Empty response from Groq')
  return content
}
