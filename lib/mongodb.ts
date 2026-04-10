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
  const client = new MongoClient(mongodbUri)
  return { client, db: client.db(dbName) }
}

export function getMongo(): { client: MongoClient; db: Db } {
  if (process.env.NODE_ENV === 'development') {
    if (!globalForMongo.__gelosMongo) {
      globalForMongo.__gelosMongo = createMongo()
    }
    return globalForMongo.__gelosMongo
  }
  return createMongo()
}
