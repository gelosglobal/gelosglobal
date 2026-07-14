export type AiContextIntent =
  | 'finance'
  | 'retail_kpis'
  | 'retail_customers'
  | 'retail_reps'
  | 'retail_b2b'
  | 'dtc'
  | 'inventory'
  | 'marketing'
  | 'products'
  | 'tasks'

const INTENT_PATTERNS: Record<AiContextIntent, RegExp[]> = {
  retail_customers: [
    /balance|outstanding|receivable|owe|debt|collect|outlet|customer|retail/i,
  ],
  retail_reps: [
    /rep|leaderboard|target|attainment|quota|visit|sell.?in|field|mtd/i,
  ],
  retail_b2b: [/b2b|invoice|overdue|collection|trade/i],
  finance: [/finance|revenue|profit|p&l|margin|cogs|opex|gross|net/i],
  dtc: [/dtc|direct|sell.?out|order|ecommerce|online/i],
  inventory: [/inventory|stock|sku|safety|warehouse|restock|critical|low stock/i],
  marketing: [/marketing|roas|campaign|ad|spend|attribution/i],
  products: [/product|sku|top seller|assortment|performance/i],
  tasks: [/task|todo|assigned/i],
  retail_kpis: [/retail|performance|week|today|summary|attention/i],
}

export function detectAiContextIntents(
  userMessage?: string,
  pathname?: string | null,
): Set<AiContextIntent> {
  const text = `${userMessage ?? ''} ${pathname ?? ''}`.toLowerCase()
  const intents = new Set<AiContextIntent>()

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as Array<
    [AiContextIntent, RegExp[]]
  >) {
    if (patterns.some((p) => p.test(text))) intents.add(intent)
  }

  if (intents.size === 0) {
    intents.add('finance')
    intents.add('retail_kpis')
    intents.add('dtc')
  }

  // Balance questions also need B2B payment context sometimes
  if (intents.has('retail_customers')) {
    intents.add('retail_b2b')
  }

  return intents
}

/** Rough token estimate for logging / budget guards (chars / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export const AI_PROMPT_MAX_CONTEXT_TOKENS = 6_500
export const AI_PROMPT_MAX_HISTORY_MESSAGES = 4
export const AI_PROMPT_MAX_ASSISTANT_CHARS = 280
