import { auth, ensureAuthMongo } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const runtime = 'nodejs'

async function handleAuth(request: Request) {
  await ensureAuthMongo()
  const handler = toNextJsHandler(auth)
  return handler.GET(request)
}

export const GET = handleAuth
export const POST = handleAuth
export const PATCH = handleAuth
export const PUT = handleAuth
export const DELETE = handleAuth
