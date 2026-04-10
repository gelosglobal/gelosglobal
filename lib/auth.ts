import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { nextCookies } from 'better-auth/next-js'
import { getAuthBaseURL, getTrustedOrigins } from '@/lib/auth-env'
import { getMongo } from '@/lib/mongodb'

const { client, db } = getMongo()

const baseURL = getAuthBaseURL()
const trustedOrigins = getTrustedOrigins()

if (!process.env.BETTER_AUTH_SECRET) {
  console.warn(
    '[auth] BETTER_AUTH_SECRET is missing. Set it in Vercel env (32+ characters).',
  )
}

export const auth = betterAuth({
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
