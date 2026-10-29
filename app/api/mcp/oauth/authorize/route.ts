import { corsPreflight } from '@/lib/mcp/http'
import { handleAuthorizeGet, handleAuthorizePost } from '@/lib/mcp/oauth-flow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return handleAuthorizeGet(request)
}

export function POST(request: Request) {
  return handleAuthorizePost(request)
}

export function OPTIONS() {
  return corsPreflight()
}
