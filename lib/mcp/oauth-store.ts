import { randomToken, secretsEqual, sha256Hex } from '@/lib/mcp/crypto'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@/lib/mcp/http'
import { ensureMongoAlive, getMongo } from '@/lib/mongodb'
import type { Collection, Db } from 'mongodb'

const CLIENTS = 'mcp_oauth_clients'
const CODES = 'mcp_oauth_codes'
const TOKENS = 'mcp_oauth_tokens'

export type McpOAuthClient = {
  clientId: string
  clientSecretHash: string | null
  redirectUris: string[]
  clientName: string | null
  tokenEndpointAuthMethod: 'none' | 'client_secret_basic' | 'client_secret_post'
  createdAt: Date
}

type CodeDoc = {
  codeHash: string
  clientId: string
  redirectUri: string
  codeChallenge: string
  email: string
  name: string | null
  resource: string | null
  expiresAt: Date
  usedAt: Date | null
}

export type McpAccessToken = {
  email: string
  name: string | null
  clientId: string
  expiresAt: Date
}

type TokenDoc = {
  accessHash: string
  refreshHash: string
  clientId: string
  email: string
  name: string | null
  resource: string | null
  expiresAt: Date
  refreshExpiresAt: Date
  deleteAt: Date
  createdAt: Date
}

const globalForIndexes = globalThis as typeof globalThis & {
  __gelosMcpOauthIndexes?: Promise<void>
}

async function db(): Promise<Db> {
  await ensureMongoAlive()
  const { db: database } = getMongo()
  if (!globalForIndexes.__gelosMcpOauthIndexes) {
    globalForIndexes.__gelosMcpOauthIndexes = createIndexes(database).catch((err) => {
      globalForIndexes.__gelosMcpOauthIndexes = undefined
      throw err
    })
  }
  await globalForIndexes.__gelosMcpOauthIndexes
  return database
}

async function createIndexes(database: Db) {
  await Promise.all([
    database.collection(CLIENTS).createIndex({ clientId: 1 }, { unique: true }),
    database.collection(CODES).createIndex({ codeHash: 1 }, { unique: true }),
    database.collection(CODES).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection(TOKENS).createIndex({ accessHash: 1 }, { unique: true }),
    database.collection(TOKENS).createIndex({ refreshHash: 1 }, { unique: true }),
    database.collection(TOKENS).createIndex({ deleteAt: 1 }, { expireAfterSeconds: 0 }),
  ])
}

function clients(database: Db): Collection<McpOAuthClient> {
  return database.collection(CLIENTS)
}

export async function insertOAuthClient(input: {
  redirectUris: string[]
  clientName: string | null
  tokenEndpointAuthMethod: McpOAuthClient['tokenEndpointAuthMethod']
}): Promise<{ client: McpOAuthClient; clientSecret: string | null }> {
  const database = await db()
  const clientSecret =
    input.tokenEndpointAuthMethod === 'none' ? null : randomToken('gelos_secret')
  const client: McpOAuthClient = {
    clientId: randomToken('gelos_client'),
    clientSecretHash: clientSecret ? sha256Hex(clientSecret) : null,
    redirectUris: input.redirectUris,
    clientName: input.clientName,
    tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
    createdAt: new Date(),
  }
  await clients(database).insertOne(client)
  return { client, clientSecret }
}

export async function findOAuthClient(clientId: string): Promise<McpOAuthClient | null> {
  const database = await db()
  return clients(database).findOne({ clientId })
}

export function clientSecretMatches(client: McpOAuthClient, secret: string | null): boolean {
  if (!client.clientSecretHash) return !secret
  if (!secret) return false
  return secretsEqual(sha256Hex(secret), client.clientSecretHash)
}

export async function insertAuthCode(input: {
  clientId: string
  redirectUri: string
  codeChallenge: string
  email: string
  name: string | null
  resource: string | null
}): Promise<string> {
  const database = await db()
  const code = randomToken('gelos_code')
  const doc: CodeDoc = {
    codeHash: sha256Hex(code),
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    email: input.email,
    name: input.name,
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000),
    usedAt: null,
  }
  await database.collection<CodeDoc>(CODES).insertOne(doc)
  return code
}

export async function consumeAuthCode(code: string): Promise<CodeDoc | null> {
  const database = await db()
  const now = new Date()
  return database.collection<CodeDoc>(CODES).findOneAndUpdate(
    { codeHash: sha256Hex(code), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  )
}

export type IssuedTokens = {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

async function issueToken(input: {
  clientId: string
  email: string
  name: string | null
  resource: string | null
  replaceAccessHash?: string
}): Promise<IssuedTokens | null> {
  const database = await db()
  const accessToken = randomToken('gelos')
  const refreshToken = randomToken('gelos')
  const now = Date.now()
  const expiresAt = new Date(now + ACCESS_TOKEN_TTL_SECONDS * 1000)
  const refreshExpiresAt = new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000)
  const next: TokenDoc = {
    accessHash: sha256Hex(accessToken),
    refreshHash: sha256Hex(refreshToken),
    clientId: input.clientId,
    email: input.email,
    name: input.name,
    resource: input.resource,
    expiresAt,
    refreshExpiresAt,
    deleteAt: refreshExpiresAt,
    createdAt: new Date(),
  }
  const col = database.collection<TokenDoc>(TOKENS)
  if (input.replaceAccessHash) {
    const updated = await col.findOneAndUpdate(
      { accessHash: input.replaceAccessHash },
      { $set: next },
    )
    if (!updated) return null
  } else {
    await col.insertOne(next)
  }
  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

export async function issueTokenForCode(code: CodeDoc): Promise<IssuedTokens> {
  const issued = await issueToken({
    clientId: code.clientId,
    email: code.email,
    name: code.name,
    resource: code.resource,
  })
  if (!issued) throw new Error('Could not issue GELOS connector token')
  return issued
}

export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
): Promise<(IssuedTokens & { email: string; name: string | null; resource: string | null }) | null> {
  const database = await db()
  const current = await database.collection<TokenDoc>(TOKENS).findOne({
    refreshHash: sha256Hex(refreshToken),
    clientId,
    refreshExpiresAt: { $gt: new Date() },
  })
  if (!current) return null
  const issued = await issueToken({
    clientId: current.clientId,
    email: current.email,
    name: current.name,
    resource: current.resource,
    replaceAccessHash: current.accessHash,
  })
  if (!issued) return null
  return { ...issued, email: current.email, name: current.name, resource: current.resource }
}

export async function findAccessToken(token: string): Promise<McpAccessToken | null> {
  const database = await db()
  const doc = await database.collection<TokenDoc>(TOKENS).findOne(
    { accessHash: sha256Hex(token), expiresAt: { $gt: new Date() } },
    { projection: { email: 1, name: 1, clientId: 1, expiresAt: 1 } },
  )
  if (!doc) return null
  return {
    email: doc.email,
    name: doc.name,
    clientId: doc.clientId,
    expiresAt: doc.expiresAt,
  }
}
