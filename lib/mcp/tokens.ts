import { sha256Hex } from '@/lib/mcp/crypto'

function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  return email.includes('@') ? email : null
}

function readEntries(raw: string): Array<[string, string]> {
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('object')
    }
    return Object.entries(parsed).flatMap(([token, email]) =>
      typeof email === 'string' ? [[token, email] as [string, string]] : [],
    )
  }

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const idx = part.indexOf('|')
      if (idx <= 0) throw new Error('pair')
      return [part.slice(0, idx).trim(), part.slice(idx + 1).trim()] as [string, string]
    })
}

function loadStaticTokens(): Map<string, string> {
  const map = new Map<string, string>()
  const add = (token: string, email: string) => {
    const normalized = normalizeEmail(email)
    if (!token || !normalized) throw new Error('email')
    map.set(sha256Hex(token), normalized)
  }

  const singleToken = process.env.GELOS_MCP_TOKEN?.trim()
  const singleEmail = process.env.GELOS_MCP_EMAIL?.trim()
  if (singleToken || singleEmail) {
    if (!singleToken || !singleEmail) throw new Error('pair')
    add(singleToken, singleEmail)
  }

  const raw = process.env.GELOS_MCP_TOKENS?.trim()
  if (!raw) return map
  for (const [token, email] of readEntries(raw)) add(token, email)
  return map
}

let cached: Map<string, string> | null = null
let failed = false

/** Email for a static connector token, or null when the token is not configured. */
export function emailForStaticToken(token: string): string | null {
  if (failed) return null
  if (!cached) {
    try {
      cached = loadStaticTokens()
    } catch {
      failed = true
      console.error(
        '[mcp] GELOS_MCP_TOKENS could not be parsed. Use {"token":"email@company.com"} or token|email pairs.',
      )
      return null
    }
  }
  return cached.get(sha256Hex(token)) ?? null
}
