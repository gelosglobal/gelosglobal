import { accessForUser, userFromRequestSession } from '@/lib/mcp/identity'
import {
  MCP_SCOPE,
  htmlResponse,
  isCrossSiteAuthorizePost,
  oauthError,
  publicBaseFromRequest,
  resourceMatches,
  withCors,
} from '@/lib/mcp/http'
import { oauthConsentPage, oauthErrorPage } from '@/lib/mcp/oauth-page'
import {
  clientSecretMatches,
  consumeAuthCode,
  findOAuthClient,
  insertAuthCode,
  insertOAuthClient,
  issueTokenForCode,
  rotateRefreshToken,
  type McpOAuthClient,
} from '@/lib/mcp/oauth-store'
import { verifyPkce } from '@/lib/mcp/crypto'
import { isAllowedRedirectUri, safeMcpNext } from '@/lib/mcp/paths'
import type { AppSection } from '@/lib/access'

const SECTION_ORDER: AppSection[] = ['master', 'dtc', 'retail', 'sell-in']

type AuthorizeInput = {
  responseType: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
  state: string
  scope: string
  resource: string
}

function readAuthorize(params: URLSearchParams): AuthorizeInput {
  return {
    responseType: params.get('response_type') ?? '',
    clientId: params.get('client_id') ?? '',
    redirectUri: params.get('redirect_uri') ?? '',
    codeChallenge: params.get('code_challenge') ?? '',
    codeChallengeMethod: params.get('code_challenge_method') ?? '',
    state: params.get('state') ?? '',
    scope: params.get('scope') ?? '',
    resource: params.get('resource') ?? '',
  }
}

function redirectWithError(input: AuthorizeInput, error: string, description: string): Response {
  const url = new URL(input.redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (input.state) url.searchParams.set('state', input.state)
  return Response.redirect(url, 303)
}

async function resolveAuthorize(
  request: Request,
  input: AuthorizeInput,
): Promise<{ ok: true; client: McpOAuthClient } | { ok: false; response: Response }> {
  const client = input.clientId ? await findOAuthClient(input.clientId) : null
  const trusted =
    client != null &&
    client.redirectUris.includes(input.redirectUri) &&
    isAllowedRedirectUri(input.redirectUri)

  const fail = (error: string, description: string, status = 400) => {
    if (trusted) return { ok: false as const, response: redirectWithError(input, error, description) }
    return {
      ok: false as const,
      response: htmlResponse(oauthErrorPage(description), status),
    }
  }

  if (!client || !trusted) {
    return fail('invalid_request', 'This connection request is not from a registered app.')
  }
  if (input.responseType !== 'code') {
    return fail('unsupported_response_type', 'response_type must be code.')
  }
  if (input.codeChallengeMethod !== 'S256' || input.codeChallenge.length < 43 || input.codeChallenge.length > 128) {
    return fail('invalid_request', 'A PKCE S256 code_challenge is required.')
  }
  if (input.scope) {
    const scopes = input.scope.split(/\s+/).filter(Boolean)
    if (scopes.length !== 1 || scopes[0] !== MCP_SCOPE) {
      return fail('invalid_scope', 'The only scope is gelos:read.')
    }
  }
  if (!resourceMatches(request, input.resource || null)) {
    return fail('invalid_target', 'resource must be this GELOS MCP server.')
  }
  return { ok: true, client }
}

function hiddenFields(input: AuthorizeInput): Record<string, string> {
  const fields: Record<string, string> = {
    response_type: input.responseType,
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: input.codeChallengeMethod,
  }
  if (input.state) fields.state = input.state
  if (input.scope) fields.scope = input.scope
  if (input.resource) fields.resource = input.resource
  return fields
}

export async function handleAuthorizeGet(request: Request): Promise<Response> {
  const input = readAuthorize(new URL(request.url).searchParams)
  const resolved = await resolveAuthorize(request, input)
  if (!resolved.ok) return resolved.response

  const user = await userFromRequestSession(request)
  if (!user) {
    const next = safeMcpNext(`${new URL(request.url).pathname}${new URL(request.url).search}`)
    if (!next) return htmlResponse(oauthErrorPage('This connection request is not valid.'), 400)
    const signIn = new URL('/sign-in', publicBaseFromRequest(request))
    signIn.searchParams.set('next', next)
    return Response.redirect(signIn, 302)
  }

  const access = accessForUser(user)
  const sections = SECTION_ORDER.filter((section) => access.sections.has(section))
  const base = publicBaseFromRequest(request)
  return htmlResponse(
    oauthConsentPage({
      clientName: resolved.client.clientName || 'This app',
      redirectHost: new URL(input.redirectUri).host,
      email: user.email,
      sections,
      fields: hiddenFields(input),
      formAction: `${base}/api/mcp/oauth/authorize`,
    }),
  )
}

export async function handleAuthorizePost(request: Request): Promise<Response> {
  if (isCrossSiteAuthorizePost(request)) {
    return htmlResponse(oauthErrorPage('Confirm the connection from the GELOS page.'), 403)
  }
  const form = await request.formData()
  const params = new URLSearchParams()
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') params.set(key, value)
  }
  const input = readAuthorize(params)
  const resolved = await resolveAuthorize(request, input)
  if (!resolved.ok) return resolved.response

  const decision = params.get('decision')
  if (decision === 'deny') {
    return redirectWithError(input, 'access_denied', 'The GELOS user cancelled the connection.')
  }
  if (decision !== 'allow') {
    return redirectWithError(input, 'invalid_request', 'Choose allow or cancel.')
  }

  const user = await userFromRequestSession(request)
  if (!user) {
    const next = safeMcpNext(`/api/mcp/oauth/authorize?${params.toString()}`)
    if (!next) return htmlResponse(oauthErrorPage('Sign in to GELOS, then try connecting again.'), 401)
    const signIn = new URL('/sign-in', publicBaseFromRequest(request))
    signIn.searchParams.set('next', next)
    return Response.redirect(signIn, 302)
  }

  const code = await insertAuthCode({
    clientId: resolved.client.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    email: user.email,
    name: user.name,
    resource: input.resource || null,
  })
  const url = new URL(input.redirectUri)
  url.searchParams.set('code', code)
  if (input.state) url.searchParams.set('state', input.state)
  return Response.redirect(url, 303)
}

function basicCredentials(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get('authorization')
  if (!header || !header.toLowerCase().startsWith('basic ')) return null
  try {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx < 0) return null
    return {
      id: decodeURIComponent(decoded.slice(0, idx)),
      secret: decodeURIComponent(decoded.slice(idx + 1)),
    }
  } catch {
    return null
  }
}

async function readTokenParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type') ?? ''
  const text = await request.text()
  if (type.includes('application/json')) {
    const json = JSON.parse(text) as Record<string, unknown>
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === 'string' || typeof value === 'number') params.set(key, String(value))
    }
    return params
  }
  return new URLSearchParams(text)
}

function tokenResponse(issued: { accessToken: string; refreshToken: string; expiresIn: number }): Response {
  return withCors(
    Response.json(
      {
        access_token: issued.accessToken,
        token_type: 'Bearer',
        expires_in: issued.expiresIn,
        refresh_token: issued.refreshToken,
        scope: MCP_SCOPE,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
  )
}

export async function handleTokenPost(request: Request): Promise<Response> {
  let params: URLSearchParams
  try {
    params = await readTokenParams(request)
  } catch {
    return oauthError(400, 'invalid_request', 'Token request body could not be read.')
  }

  const basic = basicCredentials(request)
  const clientId = basic?.id || params.get('client_id') || ''
  const presentedSecret = (basic?.secret ?? params.get('client_secret') ?? '').trim()
  const client = clientId ? await findOAuthClient(clientId) : null
  if (!client || !clientSecretMatches(client, presentedSecret || null)) {
    return oauthError(401, 'invalid_client', 'Client authentication failed.')
  }

  const grant = params.get('grant_type')
  if (grant === 'authorization_code') {
    const code = params.get('code') ?? ''
    const redirectUri = params.get('redirect_uri') ?? ''
    const verifier = params.get('code_verifier') ?? ''
    const consumed = code ? await consumeAuthCode(code) : null
    if (!consumed || consumed.clientId !== client.clientId || consumed.redirectUri !== redirectUri) {
      return oauthError(400, 'invalid_grant', 'Authorization code is invalid or expired.')
    }
    if (!verifyPkce(verifier, consumed.codeChallenge)) {
      return oauthError(400, 'invalid_grant', 'PKCE verification failed.')
    }
    if (!resourceMatches(request, params.get('resource'))) {
      return oauthError(400, 'invalid_target', 'resource must be this GELOS MCP server.')
    }
    return tokenResponse(await issueTokenForCode(consumed))
  }

  if (grant === 'refresh_token') {
    const refresh = params.get('refresh_token') ?? ''
    const rotated = refresh ? await rotateRefreshToken(refresh, client.clientId) : null
    if (!rotated) return oauthError(400, 'invalid_grant', 'Refresh token is invalid or expired.')
    return tokenResponse(rotated)
  }

  return oauthError(400, 'unsupported_grant_type', 'grant_type must be authorization_code or refresh_token.')
}

export async function handleClientRegistration(request: Request): Promise<Response> {
  let body: {
    redirect_uris?: unknown
    client_name?: unknown
    token_endpoint_auth_method?: unknown
    grant_types?: unknown
    response_types?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return oauthError(400, 'invalid_client_metadata', 'Registration body must be JSON.')
  }

  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length < 1 || body.redirect_uris.length > 8) {
    return oauthError(400, 'invalid_client_metadata', 'redirect_uris must contain 1 to 8 URLs.')
  }
  const redirectUris: string[] = []
  for (const uri of body.redirect_uris) {
    if (typeof uri !== 'string' || !isAllowedRedirectUri(uri)) {
      return oauthError(400, 'invalid_redirect_uri', 'Each redirect URI must be https, or http on localhost.')
    }
    redirectUris.push(uri)
  }

  const method = body.token_endpoint_auth_method
  const tokenEndpointAuthMethod =
    method == null || method === 'none'
      ? 'none'
      : method === 'client_secret_post' || method === 'client_secret_basic'
        ? method
        : null
  if (!tokenEndpointAuthMethod) {
    return oauthError(400, 'invalid_client_metadata', 'Unsupported token_endpoint_auth_method.')
  }

  if (body.grant_types != null) {
    if (
      !Array.isArray(body.grant_types) ||
      body.grant_types.some((grant) => grant !== 'authorization_code' && grant !== 'refresh_token')
    ) {
      return oauthError(400, 'invalid_client_metadata', 'grant_types must be authorization_code and refresh_token.')
    }
  }
  if (body.response_types != null) {
    if (!Array.isArray(body.response_types) || !body.response_types.every((item) => item === 'code')) {
      return oauthError(400, 'invalid_client_metadata', 'response_types must be code.')
    }
  }

  const clientName =
    typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim().slice(0, 120)
      : null

  try {
    const { client, clientSecret } = await insertOAuthClient({
      redirectUris,
      clientName,
      tokenEndpointAuthMethod,
    })
    return withCors(
      Response.json(
        {
          client_id: client.clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
          client_secret_expires_at: 0,
          redirect_uris: client.redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: client.tokenEndpointAuthMethod,
          ...(client.clientName ? { client_name: client.clientName } : {}),
        },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      ),
    )
  } catch (err) {
    console.error('[mcp] client registration failed', err)
    return oauthError(500, 'server_error', 'Could not register the connector.')
  }
}
