import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { nextCookies } from 'better-auth/next-js'
import { getAuthBaseURL, getTrustedOrigins } from '@/lib/auth-env'
import { ensureMongoAlive, getMongo } from '@/lib/mongodb'

const baseURL = getAuthBaseURL()
const trustedOrigins = getTrustedOrigins()

if (!process.env.BETTER_AUTH_SECRET) {
  console.warn(
    '[auth] BETTER_AUTH_SECRET is missing. Set it in Vercel env (32+ characters).',
  )
}

function createBetterAuth() {
  const { client, db } = getMongo()
  return betterAuth({
    database: mongodbAdapter(db, {
      client,
      transaction: process.env.MONGODB_USE_TRANSACTIONS === 'true',
    }),
    emailAndPassword: {
      enabled: true,
    },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins,
    plugins: [nextCookies()],
  })
}

/** Live binding — reassigned after Mongo reconnect so adapters never use a closed topology. */
export let auth = createBetterAuth()

let authWarmChain: Promise<void> = Promise.resolve()

/**
 * Run before any auth DB use on serverless: Atlas often closes idle connections while
 * Vercel reuses the isolate, which triggers MongoTopologyClosedError unless we reconnect.
 */
export async function ensureAuthMongo(): Promise<void> {
  authWarmChain = authWarmChain.then(async () => {
    const recreated = await ensureMongoAlive()
    if (recreated) {
      auth = createBetterAuth()
    }
  })
  return authWarmChain
}
