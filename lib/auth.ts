import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { nextCookies } from 'better-auth/next-js'
import { getMongo } from '@/lib/mongodb'

const { client, db } = getMongo()

export const auth = betterAuth({
  database: mongodbAdapter(db, {
    client,
    // Set MONGODB_USE_TRANSACTIONS=true when using a replica set (e.g. Atlas).
    transaction: process.env.MONGODB_USE_TRANSACTIONS === 'true',
  }),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  ],
  plugins: [nextCookies()],
})
