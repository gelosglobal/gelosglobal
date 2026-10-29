import { auth, ensureAuthMongo } from '@/lib/auth'
import type { Session } from 'better-auth'
import { getUserAccess, type UserAccess } from '@/lib/access'
import { bearerToken } from '@/lib/mcp/http'
import { findAccessToken } from '@/lib/mcp/oauth-store'
import { emailForStaticToken } from '@/lib/mcp/tokens'

export type McpUser = {
  email: string
  name: string | null
}

function normalizeEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.includes('@') ? email : null
}

export function accessForUser(user: McpUser): UserAccess {
  return getUserAccess({
    user: { email: user.email, name: user.name ?? '' },
  } as unknown as Session)
}

export async function userFromRequestSession(request: Request): Promise<McpUser | null> {
  if (!request.headers.get('cookie')) return null
  await ensureAuthMongo()
  const session = await auth.api.getSession({ headers: request.headers })
  const email = normalizeEmail(session?.user?.email)
  if (!email) return null
  return { email, name: session?.user?.name?.trim() || null }
}

export async function resolveMcpUser(request: Request): Promise<McpUser | null> {
  const token = bearerToken(request)
  if (token) {
    const staticEmail = emailForStaticToken(token)
    if (staticEmail) return { email: staticEmail, name: null }
    const issued = await findAccessToken(token)
    if (!issued) return null
    const email = normalizeEmail(issued.email)
    if (!email) return null
    return { email, name: issued.name }
  }

  return userFromRequestSession(request)
}
