/** Browser-safe path checks for the GELOS MCP connector. */

const AUTHORIZE_PATH = '/api/mcp/oauth/authorize'

export function safeMcpNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 8000) return null
  if (!raw.startsWith(`${AUTHORIZE_PATH}?`)) return null
  if (raw.includes('\\') || raw.includes('\n') || raw.includes('\r')) return null
  try {
    const url = new URL(raw, 'http://gelos.local')
    if (url.origin !== 'http://gelos.local') return null
    if (url.pathname !== AUTHORIZE_PATH) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export function isAllowedRedirectUri(raw: string): boolean {
  if (!raw || raw.length > 2000) return false
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.username || url.password || url.hash) return false
  const host = url.hostname.toLowerCase()
  if (!host || host.endsWith('.')) return false
  if (url.protocol === 'http:') {
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  }
  return url.protocol === 'https:'
}

export function isMcpResource(base: string, resource: string | null | undefined): boolean {
  if (!resource) return true
  try {
    const actual = new URL(resource)
    const expected = new URL('/api/mcp', base)
    const path = actual.pathname.replace(/\/+$/, '') || '/'
    return actual.origin === expected.origin && path === expected.pathname
  } catch {
    return false
  }
}
