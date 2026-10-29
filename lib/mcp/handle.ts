import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { accessForUser, resolveMcpUser } from '@/lib/mcp/identity'
import { corsPreflight, unauthorizedResponse, withCors } from '@/lib/mcp/http'
import { registerGelosTools } from '@/lib/mcp/tools'
import { ensureMongoAlive, getMongo } from '@/lib/mongodb'

const INSTRUCTIONS = `You are connected to GELOS OS, the staff sales platform.
Amounts are Ghana cedis (GHS). Every tool is read-only.
Call whoami if you are unsure which sections this person can see.
DTC is direct-to-consumer. Retail is field sales and B2B outlets. Sell-in is expense tracking.
Use only numbers returned by tools. If a tool is not available, this user cannot see that section.`

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return corsPreflight()

  const user = await resolveMcpUser(request)
  if (!user) return unauthorizedResponse(request)

  if (request.method !== 'POST') {
    return withCors(
      Response.json(
        {
          jsonrpc: '2.0',
          error: { code: -32601, message: 'Send MCP JSON-RPC requests as POST.' },
          id: null,
        },
        { status: 405, headers: { Allow: 'POST, OPTIONS' } },
      ),
    )
  }

  await ensureMongoAlive()
  const { db } = getMongo()
  const server = new McpServer(
    { name: 'gelos-os', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  )
  registerGelosTools(server, { db, user, access: accessForUser(user) })

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(request))
  } finally {
    await server.close().catch(() => undefined)
  }
}
