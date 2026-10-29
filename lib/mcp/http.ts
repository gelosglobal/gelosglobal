import { isMcpResource } from '@/lib/mcp/paths'

export const MCP_SCOPE = 'gelos:read'
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90
export const AUTH_CODE_TTL_SECONDS = 60 * 5

export function publicBaseFromRequest(request: Request): string {
  const url = new URL(request.url)
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (
    forwardedHost &&
    (forwardedProto === 'http' || forwardedProto === 'https') &&
    /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(forwardedHost)
  ) {
    return `${forwardedProto}://${forwardedHost}`
  }
  return url.origin
}

export function isBrowserSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const allowed = new Set<string>([publicBaseFromRequest(request)])
  try {
    allowed.add(new URL(request.url).origin)
  } catch {
    /* request url is still checked via publicBaseFromRequest */
  }
  return allowed.has(origin)
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set(
    'Access-Control-Expose-Headers',
    'WWW-Authenticate, Mcp-Session-Id, mcp-session-id',
  )
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID, Accept',
      'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export function unauthorizedResponse(request: Request): Response {
  const metadata = `${publicBaseFromRequest(request)}/.well-known/oauth-protected-resource/api/mcp`
  return withCors(
    Response.json(
      {
        error: 'unauthorized',
        error_description:
          'Sign in through the GELOS connector, or send Authorization: Bearer with a GELOS MCP token.',
      },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer realm="gelos-os", resource_metadata="${metadata}"`,
          'Cache-Control': 'no-store',
        },
      },
    ),
  )
}

export function oauthError(status: number, error: string, description: string): Response {
  return withCors(
    Response.json(
      { error, error_description: description },
      { status, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' } },
    ),
  )
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
  }
}

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/mcp/oauth/authorize`,
    token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    scopes_supported: [MCP_SCOPE],
  }
}

export function resourceMatches(request: Request, resource: string | null): boolean {
  return isMcpResource(publicBaseFromRequest(request), resource)
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (header) {
    const match = header.match(/^Bearer\s+(\S+)\s*$/i)
    if (match?.[1]) return match[1]
  }
  const apiKey = request.headers.get('x-api-key')?.trim()
  return apiKey || null
}
