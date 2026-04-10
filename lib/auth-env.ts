function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, '')
}

/**
 * Canonical app URL for Better Auth (no trailing slash).
 * Prefer BETTER_AUTH_URL; on Vercel fall back to https://VERCEL_URL.
 */
export function getAuthBaseURL(): string {
  if (process.env.BETTER_AUTH_URL?.trim()) {
    return stripTrailingSlash(process.env.BETTER_AUTH_URL.trim())
  }
  if (process.env.VERCEL_URL?.trim()) {
    return stripTrailingSlash(`https://${process.env.VERCEL_URL.trim()}`)
  }
  return 'http://localhost:3000'
}

/**
 * Origins allowed for CSRF / cross-origin checks. Include production, previews,
 * and any explicit BETTER_AUTH_TRUSTED_ORIGINS (comma-separated).
 */
export function getTrustedOrigins(): string[] {
  const origins = new Set<string>()
  const add = (raw?: string | null) => {
    if (!raw?.trim()) return
    try {
      origins.add(stripTrailingSlash(raw.trim()))
    } catch {
      /* ignore invalid */
    }
  }

  add(getAuthBaseURL())
  add(process.env.BETTER_AUTH_URL)
  add(process.env.NEXT_PUBLIC_APP_URL)
  if (process.env.VERCEL_URL?.trim()) {
    add(`https://${process.env.VERCEL_URL.trim()}`)
  }
  const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',') ?? []
  for (const o of extra) add(o)

  return [...origins]
}
