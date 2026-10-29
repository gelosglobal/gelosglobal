import { handleMcpRequest } from '@/lib/mcp/handle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export function GET(request: Request) {
  return handleMcpRequest(request)
}

export function POST(request: Request) {
  return handleMcpRequest(request)
}

export function DELETE(request: Request) {
  return handleMcpRequest(request)
}

export function OPTIONS(request: Request) {
  return handleMcpRequest(request)
}
