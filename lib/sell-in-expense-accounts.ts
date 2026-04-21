import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SELL_IN_EXPENSE_ACCOUNTS_COLLECTION = 'sell_in_expense_accounts'

export type SellInExpenseAccountDoc = {
  _id: ObjectId
  name: string
  createdAt: Date
  updatedAt: Date
}

export type SellInExpenseAccountJson = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export function serializeSellInExpenseAccount(
  doc: SellInExpenseAccountDoc,
): SellInExpenseAccountJson {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function col(db: Db) {
  return db.collection<WithoutId<SellInExpenseAccountDoc>>(SELL_IN_EXPENSE_ACCOUNTS_COLLECTION)
}

export async function listSellInExpenseAccounts(db: Db): Promise<SellInExpenseAccountDoc[]> {
  const rows = await col(db).find({}).sort({ name: 1 }).limit(2000).toArray()
  return rows.map((r) => r as SellInExpenseAccountDoc)
}

export async function createSellInExpenseAccount(
  db: Db,
  name: string,
): Promise<SellInExpenseAccountDoc> {
  const now = new Date()
  const doc: WithoutId<SellInExpenseAccountDoc> = {
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
  }
  const res = await col(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export async function updateSellInExpenseAccount(
  db: Db,
  id: ObjectId,
  name: string,
): Promise<SellInExpenseAccountDoc | null> {
  const res = await col(db).findOneAndUpdate(
    { _id: id },
    { $set: { name: name.trim(), updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  return res as SellInExpenseAccountDoc | null
}

export async function deleteSellInExpenseAccount(db: Db, id: ObjectId): Promise<boolean> {
  const r = await col(db).deleteOne({ _id: id })
  return r.deletedCount === 1
}

