import { MongoClient, type Db } from 'mongodb'

const rawMongoUri = process.env.MONGODB_URI ?? process.env.DATABASE_URL
if (!rawMongoUri) {
  throw new Error(
    'Set MONGODB_URI or DATABASE_URL to your MongoDB connection string',
  )
}
const mongodbUri: string = rawMongoUri

const dbName = process.env.MONGODB_DB_NAME ?? 'gelos'

const globalForMongo = globalThis as typeof globalThis & {
  __gelosMongo?: { client: MongoClient; db: Db }
}

function createMongo(): { client: MongoClient; db: Db } {
  const client = new MongoClient(mongodbUri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 55_000,
    serverSelectionTimeoutMS: 15_000,
    connectTimeoutMS: 15_000,
  })
  return { client, db: client.db(dbName) }
}

export function getMongo(): { client: MongoClient; db: Db } {
  if (!globalForMongo.__gelosMongo) {
    globalForMongo.__gelosMongo = createMongo()
  }
  return globalForMongo.__gelosMongo
}

async function destroyCachedMongo(): Promise<void> {
  const cached = globalForMongo.__gelosMongo
  globalForMongo.__gelosMongo = undefined
  if (!cached) return
  try {
    await cached.client.close()
  } catch {
    /* ignore close errors on dead topology */
  }
}

/**
 * Ping the cached client; if the topology was closed (common on Vercel after idle),
 * drop the client and open a new one. Returns true if a new client was created.
 */
export async function ensureMongoAlive(): Promise<boolean> {
  if (!globalForMongo.__gelosMongo) {
    globalForMongo.__gelosMongo = createMongo()
    await globalForMongo.__gelosMongo.client.connect()
    return true
  }

  const { client } = globalForMongo.__gelosMongo
  try {
    await client.db('admin').command({ ping: 1 }, { timeoutMS: 5000 })
    return false
  } catch {
    await destroyCachedMongo()
    globalForMongo.__gelosMongo = createMongo()
    await globalForMongo.__gelosMongo.client.connect()
    return true
  }
}
