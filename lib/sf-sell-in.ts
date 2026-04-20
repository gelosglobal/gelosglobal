import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const SF_SELL_IN_COLLECTION = 'sf_sell_in'

export type SfSellInStatus = 'ordered' | 'in_transit' | 'arrived'

export type SfSellInDoc = {
  _id: ObjectId
  sellInGhs: number
  productName: string
  country: string
  /** Optional for backward compatibility; prefer manufacturerName + manufacturerContact. */
  manufacturer?: string
  manufacturerName?: string
  manufacturerContact?: string
  occurredAt: Date
  quantity: number
  status: SfSellInStatus
  etaAt?: Date
  createdAt: Date
  updatedAt: Date
}

export type SfSellInJson = {
  id: string
  sellInGhs: number
  productName: string
  country: string
  manufacturerName: string
  manufacturerContact: string
  occurredAt: string
  quantity: number
  status: SfSellInStatus
  etaAt: string | null
  createdAt: string
  updatedAt: string
}

export function serializeSfSellIn(doc: SfSellInDoc): SfSellInJson {
  const manufacturerName = (doc.manufacturerName ?? doc.manufacturer ?? '').trim()
  const manufacturerContact = (doc.manufacturerContact ?? '').trim()
  return {
    id: doc._id.toHexString(),
    sellInGhs: doc.sellInGhs,
    productName: doc.productName,
    country: doc.country,
    manufacturerName,
    manufacturerContact,
    occurredAt: doc.occurredAt.toISOString(),
    quantity: doc.quantity,
    status: doc.status,
    etaAt: doc.etaAt ? doc.etaAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function sellInCollection(db: Db) {
  return db.collection<WithoutId<SfSellInDoc>>(SF_SELL_IN_COLLECTION)
}

export async function listSfSellIn(db: Db): Promise<SfSellInDoc[]> {
  const rows = await sellInCollection(db)
    .find({})
    .sort({ occurredAt: -1, createdAt: -1 })
    .limit(5000)
    .toArray()
  return rows.map((r) => r as SfSellInDoc)
}

export type CreateSfSellInInput = {
  sellInGhs: number
  productName: string
  country: string
  manufacturerName: string
  manufacturerContact: string
  occurredAt: Date
  quantity: number
  status: SfSellInStatus
  etaAt?: Date
}

export async function createSfSellIn(
  db: Db,
  input: CreateSfSellInInput,
): Promise<SfSellInDoc> {
  const now = new Date()
  const doc: WithoutId<SfSellInDoc> = {
    sellInGhs: input.sellInGhs,
    productName: input.productName.trim(),
    country: input.country.trim(),
    manufacturerName: input.manufacturerName.trim(),
    manufacturerContact: input.manufacturerContact.trim(),
    occurredAt: input.occurredAt,
    quantity: input.quantity,
    status: input.status,
    etaAt: input.etaAt,
    createdAt: now,
    updatedAt: now,
  }
  const res = await sellInCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateSfSellInInput = Partial<{
  sellInGhs: number
  productName: string
  country: string
  manufacturerName: string
  manufacturerContact: string
  occurredAt: Date
  quantity: number
  status: SfSellInStatus
  etaAt: Date | null
}>

export async function updateSfSellIn(
  db: Db,
  id: ObjectId,
  patch: UpdateSfSellInInput,
): Promise<SfSellInDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.sellInGhs !== undefined) $set.sellInGhs = patch.sellInGhs
  if (patch.productName !== undefined) $set.productName = patch.productName.trim()
  if (patch.country !== undefined) $set.country = patch.country.trim()
  if (patch.manufacturerName !== undefined)
    $set.manufacturerName = patch.manufacturerName.trim()
  if (patch.manufacturerContact !== undefined)
    $set.manufacturerContact = patch.manufacturerContact.trim()
  if (patch.occurredAt !== undefined) $set.occurredAt = patch.occurredAt
  if (patch.quantity !== undefined) $set.quantity = patch.quantity
  if (patch.status !== undefined) $set.status = patch.status
  if (patch.etaAt !== undefined) $set.etaAt = patch.etaAt ?? undefined
  if (Object.keys($set).length === 1) return null

  const res = await sellInCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfSellInDoc | null
}

export async function deleteSfSellIn(db: Db, id: ObjectId): Promise<boolean> {
  const res = await sellInCollection(db).deleteOne({ _id: id })
  return res.deletedCount === 1
}

