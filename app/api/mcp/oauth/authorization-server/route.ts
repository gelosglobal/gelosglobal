import { authorizationServerGet, metadataOptions } from '@/lib/mcp/metadata-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return authorizationServerGet(request)
}

export function OPTIONS() {
  return metadataOptions()
}
