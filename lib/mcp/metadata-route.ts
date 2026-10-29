import {
  authorizationServerMetadata,
  corsPreflight,
  protectedResourceMetadata,
  publicBaseFromRequest,
  withCors,
} from '@/lib/mcp/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function metadata(request: Request, kind: 'resource' | 'authorization') {
  const base = publicBaseFromRequest(request)
  const body = kind === 'resource' ? protectedResourceMetadata(base) : authorizationServerMetadata(base)
  return withCors(
    Response.json(body, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    }),
  )
}

export function protectedResourceGet(request: Request) {
  return metadata(request, 'resource')
}

export function authorizationServerGet(request: Request) {
  return metadata(request, 'authorization')
}

export function metadataOptions() {
  return corsPreflight()
}
