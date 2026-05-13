import type { Db, WithoutId } from 'mongodb'
import { ObjectId } from 'mongodb'
import { subDays } from 'date-fns'
import { computeDaysCover, computeStockHealth, type StockHealth } from '@/lib/dtc-inventory'
import { SF_ORDERS_COLLECTION } from '@/lib/sf-orders'

export const SF_INVENTORY_COLLECTION = 'sf_inventory'
export const SF_INVENTORY_DEFAULT_OUTLET = 'Retail'

export type SfInventoryDoc = {
  _id: ObjectId
  sku: string
  name: string
  // Legacy field (we no longer model inventory per-outlet in the UI)
  outlet?: string
  /** Optional rep/merchandiser who last counted / owns the outlet. */
  repName?: string
  costGhs?: number
  priceGhs?: number
  onHand: number
  safetyStock: number
  /** Optional suggested reorder quantity. */
  reorderQty?: number
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
  repName?: string
  costGhs: number | null
  priceGhs: number | null
  onHand: number
  safetyStock: number
  reorderQty: number | null
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
    repName: doc.repName,
    costGhs: typeof doc.costGhs === 'number' && Number.isFinite(doc.costGhs) ? doc.costGhs : null,
    priceGhs: typeof doc.priceGhs === 'number' && Number.isFinite(doc.priceGhs) ? doc.priceGhs : null,
    onHand: doc.onHand,
    safetyStock: doc.safetyStock,
    reorderQty:
      typeof doc.reorderQty === 'number' && Number.isFinite(doc.reorderQty) ? doc.reorderQty : null,
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
    .sort({ sku: 1 })
    .limit(4000)
    .toArray()
  return rows.map((r) => r as SfInventoryDoc)
}

const SF_INVENTORY_VELOCITY_WINDOW_DAYS = 30

export type SfInventoryListPayload = {
  items: SfInventoryJson[]
  stats: ReturnType<typeof computeSfInventoryStats>
}

/**
 * Same payload shape as `GET /api/sf/inventory`: retail stock lines with `dailyDemand` /
 * `daysCover` derived from recent SF orders (30-day velocity), not only the stored doc field.
 */
export async function listSfInventoryWithOrderVelocity(db: Db): Promise<SfInventoryListPayload> {
  const now = new Date()
  const since = subDays(now, SF_INVENTORY_VELOCITY_WINDOW_DAYS)
  const rows = await listSfInventory(db)

  const skuVelocity = new Map<string, number>()
  const agg = await db
    .collection(SF_ORDERS_COLLECTION)
    .aggregate<{ sku: string; units: number }>([
      { $match: { orderedAt: { $gte: since, $lte: now } } },
      { $unwind: '$items' },
      {
        $match: {
          'items.sku': { $type: 'string' },
        },
      },
      {
        $group: {
          _id: { sku: { $toUpper: '$items.sku' } },
          units: { $sum: { $ifNull: ['$items.qty', 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          sku: '$_id.sku',
          units: 1,
        },
      },
    ])
    .toArray()

  for (const r of agg) {
    const units = Number(r.units) || 0
    skuVelocity.set(String(r.sku).toUpperCase(), units / SF_INVENTORY_VELOCITY_WINDOW_DAYS)
  }

  const stats = computeSfInventoryStats(rows)
  const items = rows.map((row) => {
    const base = serializeSfInventoryItem(row)
    const v = skuVelocity.get(base.sku.toUpperCase())
    const dailyDemand = v ? Math.round(v * 10) / 10 : 0
    const daysCover = dailyDemand > 0 ? Math.floor(base.onHand / dailyDemand) : null
    return { ...base, dailyDemand, daysCover }
  })

  return { items, stats }
}

export type CreateSfInventoryInput = {
  sku: string
  name: string
  repName?: string
  costGhs?: number
  priceGhs?: number
  onHand: number
  safetyStock: number
  reorderQty?: number
  dailyDemand?: number
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
    outlet: SF_INVENTORY_DEFAULT_OUTLET,
    repName: input.repName?.trim() || undefined,
    costGhs: input.costGhs,
    priceGhs: input.priceGhs,
    onHand: input.onHand,
    safetyStock: input.safetyStock,
    reorderQty: input.reorderQty,
    dailyDemand: input.dailyDemand ?? 0,
    lastCountedAt: input.lastCountedAt,
    createdAt: now,
    updatedAt: now,
  }
  const res = await inventoryCollection(db).insertOne(doc)
  return { _id: res.insertedId, ...doc }
}

export type UpdateSfInventoryInput = Partial<{
  sku: string
  name: string
  repName: string | null
  costGhs: number | null
  priceGhs: number | null
  onHand: number
  safetyStock: number
  reorderQty: number | null
  dailyDemand: number
  lastCountedAt: Date | null
}>

export type UpdateSfInventoryItemResult =
  | { ok: true; doc: SfInventoryDoc }
  | { ok: false; reason: 'not_found' | 'duplicate_sku' }

export async function updateSfInventoryItem(
  db: Db,
  id: ObjectId,
  patch: UpdateSfInventoryInput,
): Promise<UpdateSfInventoryItemResult> {
  const $set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.sku !== undefined) {
    const skuNorm = patch.sku.trim().toUpperCase()
    const dup = await inventoryCollection(db).findOne({
      _id: { $ne: id },
      $expr: {
        $eq: [
          { $toUpper: { $trim: { input: { $ifNull: ['$sku', ''] } } } },
          skuNorm,
        ],
      },
    })
    if (dup) return { ok: false, reason: 'duplicate_sku' }
    $set.sku = skuNorm
  }
  if (patch.name !== undefined) $set.name = patch.name.trim()
  if (patch.repName !== undefined) $set.repName = patch.repName ? patch.repName.trim() : undefined
  if (patch.costGhs !== undefined) $set.costGhs = patch.costGhs ?? undefined
  if (patch.priceGhs !== undefined) $set.priceGhs = patch.priceGhs ?? undefined
  if (patch.onHand !== undefined) $set.onHand = patch.onHand
  if (patch.safetyStock !== undefined) $set.safetyStock = patch.safetyStock
  if (patch.reorderQty !== undefined) $set.reorderQty = patch.reorderQty ?? undefined
  if (patch.dailyDemand !== undefined) $set.dailyDemand = patch.dailyDemand
  if (patch.lastCountedAt !== undefined)
    $set.lastCountedAt = patch.lastCountedAt ?? undefined

  const res = await inventoryCollection(db).findOneAndUpdate(
    { _id: id },
    { $set },
    { returnDocument: 'after' },
  )
  if (!res) return { ok: false, reason: 'not_found' }
  return { ok: true, doc: res as SfInventoryDoc }
}

export function computeSfInventoryStats(rows: SfInventoryDoc[]) {
  const skuSet = new Set<string>()
  let belowSafety = 0
  let critical = 0

  for (const r of rows) {
    if (r.sku) skuSet.add(r.sku)
    const health = computeStockHealth(r.onHand, r.safetyStock)
    if (health === 'critical') critical += 1
    if (health === 'low' || health === 'critical') belowSafety += 1
  }

  return {
    skusTracked: skuSet.size,
    belowSafety,
    critical,
  }
}

export type SfInventoryQtyMutationResult = 'ok' | 'not_found' | 'insufficient'

/** Decrease `onHand` on an `sf_inventory` row when qty ships (e.g. B2B invoice line). */
export async function decrementSfInventoryOnHandById(
  db: Db,
  id: ObjectId,
  qty: number,
): Promise<SfInventoryQtyMutationResult> {
  if (!Number.isFinite(qty) || qty <= 0) return 'ok'
  const col = db.collection(SF_INVENTORY_COLLECTION)
  const res = await col.findOneAndUpdate(
    { _id: id, onHand: { $gte: qty } },
    { $inc: { onHand: -qty }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (res) return 'ok'
  const exists = await col.findOne({ _id: id }, { projection: { _id: 1 } })
  if (!exists) return 'not_found'
  return 'insufficient'
}

/** Increase `onHand` (e.g. invoice deleted or line qty reduced). */
export async function incrementSfInventoryOnHandById(
  db: Db,
  id: ObjectId,
  qty: number,
): Promise<boolean> {
  if (!Number.isFinite(qty) || qty <= 0) return true
  const col = db.collection(SF_INVENTORY_COLLECTION)
  const res = await col.findOneAndUpdate(
    { _id: id },
    { $inc: { onHand: qty }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' },
  )
  return Boolean(res)
}

