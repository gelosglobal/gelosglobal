import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'

export const DTC_INVENTORY_COLLECTION = 'dtc_inventory'

export type StockHealth = 'ok' | 'low' | 'critical'

export type DtcInventoryDoc = {
  _id: ObjectId
  sku: string
  name: string
  warehouse: string
  /** Unit cost in GHS (optional; used for margin display). */
  costGhs?: number
  /** Unit selling price in GHS (optional; used for margin display). */
  priceGhs?: number
  onHand: number
  safetyStock: number
  /** Average units sold per day — used to estimate days of cover. */
  dailyDemand?: number
  /** Pipeline value in GHS (open PO / inbound). */
  inTransitValue: number
  createdAt: Date
  updatedAt: Date
}

export type DtcInventoryJson = {
  id: string
  sku: string
  name: string
  warehouse: string
  costGhs: number | null
  priceGhs: number | null
  onHand: number
  safetyStock: number
  dailyDemand: number
  daysCover: number | null
  health: StockHealth
  inTransitValue: number
  createdAt: string
  updatedAt: string
}

export function computeStockHealth(
  onHand: number,
  safetyStock: number,
): StockHealth {
  const safety = Math.max(0, safetyStock)
  if (onHand <= 0 || (safety > 0 && onHand < safety * 0.3)) {
    return 'critical'
  }
  if (safety > 0 && onHand < safety) return 'low'
  return 'ok'
}

export function computeDaysCover(
  onHand: number,
  dailyDemand: number,
): number | null {
  if (dailyDemand <= 0) return null
  return Math.floor(onHand / dailyDemand)
}

export function serializeInventoryItem(doc: DtcInventoryDoc): DtcInventoryJson {
  const dailyDemand = Number.isFinite(doc.dailyDemand as number) ? (doc.dailyDemand as number) : 0
  const daysCover = computeDaysCover(doc.onHand, dailyDemand)
  return {
    id: doc._id.toHexString(),
    sku: doc.sku,
    name: doc.name,
    warehouse: doc.warehouse,
    costGhs: typeof doc.costGhs === 'number' ? doc.costGhs : null,
    priceGhs: typeof doc.priceGhs === 'number' ? doc.priceGhs : null,
    onHand: doc.onHand,
    safetyStock: doc.safetyStock,
    dailyDemand,
    daysCover,
    health: computeStockHealth(doc.onHand, doc.safetyStock),
    inTransitValue: doc.inTransitValue,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

function inventoryCollection(db: Db) {
  return db.collection<WithoutId<DtcInventoryDoc>>(DTC_INVENTORY_COLLECTION)
}

export async function listDtcInventory(db: Db): Promise<DtcInventoryDoc[]> {
  const rows = await inventoryCollection(db)
    .find({})
    .sort({ sku: 1 })
    .limit(2000)
    .toArray()
  return rows.map((r) => r as DtcInventoryDoc)
}

export type CreateDtcInventoryInput = {
  sku: string
  name: string
  warehouse: string
  costGhs?: number
  priceGhs?: number
  onHand: number
  safetyStock: number
  dailyDemand?: number
  inTransitValue: number
}

export async function createDtcInventoryItem(
  db: Db,
  input: CreateDtcInventoryInput,
): Promise<DtcInventoryDoc> {
  const now = new Date()
  const doc: WithoutId<DtcInventoryDoc> = {
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    warehouse: input.warehouse.trim(),
    costGhs: input.costGhs,
    priceGhs: input.priceGhs,
    onHand: input.onHand,
    safetyStock: input.safetyStock,
    dailyDemand: input.dailyDemand,
    inTransitValue: input.inTransitValue,
    createdAt: now,
    updatedAt: now,
  }
  const res = await inventoryCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateDtcInventoryInput = Partial<{
  name: string
  warehouse: string
  costGhs: number | null
  priceGhs: number | null
  onHand: number
  safetyStock: number
  dailyDemand: number
  inTransitValue: number
}>

export async function updateDtcInventoryItem(
  db: Db,
  id: ObjectId,
  patch: UpdateDtcInventoryInput,
): Promise<DtcInventoryDoc | null> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined) $set.name = patch.name.trim()
  if (patch.warehouse !== undefined) $set.warehouse = patch.warehouse.trim()
  if (patch.costGhs !== undefined) $set.costGhs = patch.costGhs ?? undefined
  if (patch.priceGhs !== undefined) $set.priceGhs = patch.priceGhs ?? undefined
  if (patch.onHand !== undefined) $set.onHand = patch.onHand
  if (patch.safetyStock !== undefined) $set.safetyStock = patch.safetyStock
  if (patch.dailyDemand !== undefined) $set.dailyDemand = patch.dailyDemand
  if (patch.inTransitValue !== undefined)
    $set.inTransitValue = patch.inTransitValue

  const res = await inventoryCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  return res as DtcInventoryDoc | null
}

export function computeInventoryStats(rows: DtcInventoryDoc[]) {
  let belowSafety = 0
  let inTransitTotal = 0
  for (const r of rows) {
    if (r.onHand < r.safetyStock) belowSafety += 1
    inTransitTotal += r.inTransitValue
  }
  return {
    skusTracked: rows.length,
    belowSafety,
    inTransitTotalGhs: inTransitTotal,
  }
}
