import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { computeDaysCover, computeStockHealth, type StockHealth } from '@/lib/dtc-inventory'

export const SF_INVENTORY_COLLECTION = 'sf_inventory'

export type SfInventoryDoc = {
  _id: ObjectId
  sku: string
  name: string
  outlet: string
  /** Optional rep/merchandiser who last counted / owns the outlet. */
  repName?: string
  onHand: number
  safetyStock: number
  /** Optional demand rate to estimate days of cover. */
  dailyDemand: number
  /** When the stock was last physically counted. */
  lastCountedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export type SfInventoryJson = {
  id: string
  sku: string
  name: string
  outlet: string
  repName?: string
  onHand: number
  safetyStock: number
  dailyDemand: number
  daysCover: number | null
  health: StockHealth
  lastCountedAt?: string
  createdAt: string
  updatedAt: string
}

export function serializeSfInventoryItem(doc: SfInventoryDoc): SfInventoryJson {
  const daysCover = computeDaysCover(doc.onHand, doc.dailyDemand)
  return {
    id: doc._id.toHexString(),
    sku: doc.sku,
    name: doc.name,
    outlet: doc.outlet,
    repName: doc.repName,
    onHand: doc.onHand,
    safetyStock: doc.safetyStock,
    dailyDemand: doc.dailyDemand,
    daysCover,
    health: computeStockHealth(doc.onHand, doc.safetyStock),
    lastCountedAt: doc.lastCountedAt ? doc.lastCountedAt.toISOString() : undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function inventoryCollection(db: Db) {
  return db.collection<WithoutId<SfInventoryDoc>>(SF_INVENTORY_COLLECTION)
}

export async function listSfInventory(db: Db): Promise<SfInventoryDoc[]> {
  const rows = await inventoryCollection(db)
    .find({})
    .sort({ outlet: 1, sku: 1 })
    .limit(4000)
    .toArray()
  return rows.map((r) => r as SfInventoryDoc)
}

export type CreateSfInventoryInput = {
  sku: string
  name: string
  outlet: string
  repName?: string
  onHand: number
  safetyStock: number
  dailyDemand: number
  lastCountedAt?: Date
}

export async function createSfInventoryItem(
  db: Db,
  input: CreateSfInventoryInput,
): Promise<SfInventoryDoc> {
  const now = new Date()
  const doc: WithoutId<SfInventoryDoc> = {
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    outlet: input.outlet.trim(),
    repName: input.repName?.trim() || undefined,
    onHand: input.onHand,
    safetyStock: input.safetyStock,
    dailyDemand: input.dailyDemand,
    lastCountedAt: input.lastCountedAt,
    createdAt: now,
    updatedAt: now,
  }
  const res = await inventoryCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateSfInventoryInput = Partial<{
  name: string
  outlet: string
  repName: string | null
  onHand: number
  safetyStock: number
  dailyDemand: number
  lastCountedAt: Date | null
}>

export async function updateSfInventoryItem(
  db: Db,
  id: ObjectId,
  patch: UpdateSfInventoryInput,
): Promise<SfInventoryDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) $set.name = patch.name.trim()
  if (patch.outlet !== undefined) $set.outlet = patch.outlet.trim()
  if (patch.repName !== undefined) $set.repName = patch.repName ? patch.repName.trim() : undefined
  if (patch.onHand !== undefined) $set.onHand = patch.onHand
  if (patch.safetyStock !== undefined) $set.safetyStock = patch.safetyStock
  if (patch.dailyDemand !== undefined) $set.dailyDemand = patch.dailyDemand
  if (patch.lastCountedAt !== undefined)
    $set.lastCountedAt = patch.lastCountedAt ?? undefined

  const res = await inventoryCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as SfInventoryDoc | null
}

export function computeSfInventoryStats(rows: SfInventoryDoc[]) {
  const outletSet = new Set<string>()
  const skuSet = new Set<string>()
  let belowSafety = 0
  let critical = 0

  for (const r of rows) {
    if (r.outlet) outletSet.add(r.outlet)
    if (r.sku) skuSet.add(r.sku)
    const health = computeStockHealth(r.onHand, r.safetyStock)
    if (health === 'critical') critical += 1
    if (health === 'low' || health === 'critical') belowSafety += 1
  }

  return {
    outletsTracked: outletSet.size,
    skusTracked: skuSet.size,
    belowSafety,
    critical,
  }
}

