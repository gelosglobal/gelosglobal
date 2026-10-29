import { corsPreflight } from '@/lib/mcp/http'
import { handleTokenPost } from '@/lib/mcp/oauth-flow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function POST(request: Request) {
  return handleTokenPost(request)
}

export function OPTIONS() {
  return corsPreflight()
}
