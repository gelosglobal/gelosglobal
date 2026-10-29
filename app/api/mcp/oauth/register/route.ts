import { corsPreflight } from '@/lib/mcp/http'
import { handleClientRegistration } from '@/lib/mcp/oauth-flow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handleClientRegistration(request)
}

export function OPTIONS() {
  return corsPreflight()
}
