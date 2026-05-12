import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'
import {
  DTC_INVENTORY_COLLECTION,
  decrementDtcInventoryOnHandById,
  incrementDtcInventoryOnHandById,
} from '@/lib/dtc-inventory'
import type { DtcOrderItem } from '@/lib/dtc-orders'

export class DtcOrderInventoryError extends Error {
  readonly code: 'AMBIGUOUS_SKU' | 'NOT_FOUND' | 'INSUFFICIENT'

  constructor(code: DtcOrderInventoryError['code'], message: string) {
    super(message)
    this.name = 'DtcOrderInventoryError'
    this.code = code
  }
}

export function isDtcOrderInventoryError(e: unknown): e is DtcOrderInventoryError {
  return e instanceof DtcOrderInventoryError
}

/** Handles string, BSON `ObjectId`, or missing (Mongo may return nested ids as ObjectId). */
export function extractDtcInventoryItemIdFromLine(it: {
  inventoryItemId?: unknown
}): string | undefined {
  const raw = it.inventoryItemId
  if (raw == null) return undefined
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (s && ObjectId.isValid(s)) return s
    return undefined
  }
  if (raw instanceof ObjectId) return raw.toHexString()
  return undefined
}

/** Map DB order lines into input for `attachResolvedInventoryIds` (stable ids + numeric qty). */
export function orderItemsForInventoryAttach(items: DtcOrderItem[]): Array<{
  sku?: string
  name: string
  qty: number
  unitPrice: number
  inventoryItemId?: string
}> {
  return items.map((it) => {
    const inv = extractDtcInventoryItemIdFromLine(it)
    const qty = Number((it as { qty?: unknown }).qty)
    const unitPrice = Number((it as { unitPrice?: unknown }).unitPrice)
    return {
      sku: it.sku,
      name: it.name,
      qty: Number.isFinite(qty) ? qty : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      ...(inv ? { inventoryItemId: inv } : {}),
    }
  })
}

type DecOp = { id: ObjectId; qty: number }

function qtyByInventoryItemId(items: DtcOrderItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of items) {
    const idStr = extractDtcInventoryItemIdFromLine(it)
    if (!idStr) continue
    const k = idStr.toLowerCase()
    const qty = Number((it as { qty?: unknown }).qty)
    const q = Number.isFinite(qty) ? qty : 0
    if (q <= 0) continue
    m.set(k, (m.get(k) ?? 0) + q)
  }
  return m
}

export function inventoryDecrementOpsFromOrderItems(items: DtcOrderItem[]): DecOp[] {
  const m = qtyByInventoryItemId(items)
  return [...m.entries()].map(([k, qty]) => ({ id: new ObjectId(k), qty }))
}

/**
 * Resolve which `dtc_inventory` row an order line consumes.
 * Prefers explicit `inventoryItemId`; otherwise a unique SKU match (case-insensitive).
 */
export async function resolveOrderLineInventoryId(
  db: Db,
  item: Pick<DtcOrderItem, 'sku' | 'inventoryItemId'>,
): Promise<ObjectId | null> {
  const invHex = extractDtcInventoryItemIdFromLine(item as { inventoryItemId?: unknown })
  if (invHex) {
    const oid = new ObjectId(invHex)
    const col = db.collection(DTC_INVENTORY_COLLECTION)
    const exists = await col.findOne({ _id: oid }, { projection: { _id: 1 } })
    if (!exists) {
      throw new DtcOrderInventoryError(
        'NOT_FOUND',
        'One or more inventory lines no longer exist. Refresh the page and pick products again.',
      )
    }
    return oid
  }

  const sku = item.sku?.trim()
  if (!sku) return null

  const upper = sku.toUpperCase()
  const docs = await db
    .collection(DTC_INVENTORY_COLLECTION)
    .find<{ _id: ObjectId }>({ sku: upper })
    .limit(5)
    .toArray()

  if (docs.length === 0) return null
  if (docs.length > 1) {
    throw new DtcOrderInventoryError(
      'AMBIGUOUS_SKU',
      `SKU "${sku}" exists in multiple warehouse rows. Pick the product from DTC inventory.`,
    )
  }
  return docs[0]!._id
}

/**
 * Fills `inventoryItemId` on each line when it can be resolved (picker id or unique SKU).
 */
export async function attachResolvedInventoryIds(
  db: Db,
  items: Array<{
    sku?: string
    name: string
    qty: number
    unitPrice: number
    inventoryItemId?: string
  }>,
): Promise<DtcOrderItem[]> {
  const out: DtcOrderItem[] = []
  for (const item of items) {
    const id = await resolveOrderLineInventoryId(db, item)
    out.push({
      sku: item.sku,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      ...(id ? { inventoryItemId: id.toHexString() } : {}),
    })
  }
  return out
}

async function rollbackDecrements(db: Db, applied: DecOp[]) {
  for (const op of applied.slice().reverse()) {
    await incrementDtcInventoryOnHandById(db, op.id, op.qty)
  }
}

/**
 * Decrements inventory for a new order. Rolls back all decrements if any step fails or `fn` throws.
 */
export async function withInventoryDecrementsForNewOrder<T>(
  db: Db,
  ops: DecOp[],
  fn: () => Promise<T>,
): Promise<T> {
  const applied: DecOp[] = []
  for (const op of ops) {
    const r = await decrementDtcInventoryOnHandById(db, op.id, op.qty)
    if (r === 'not_found') {
      await rollbackDecrements(db, applied)
      throw new DtcOrderInventoryError(
        'NOT_FOUND',
        'One or more inventory lines no longer exist. Refresh the page and pick products again.',
      )
    }
    if (r === 'insufficient') {
      await rollbackDecrements(db, applied)
      throw new DtcOrderInventoryError(
        'INSUFFICIENT',
        'Insufficient stock for one or more lines. Reduce quantities or pick different products.',
      )
    }
    applied.push(op)
  }
  try {
    return await fn()
  } catch (e) {
    await rollbackDecrements(db, applied)
    throw e
  }
}

type DeltaOp = { id: ObjectId; delta: number }

function buildInventoryDeltaOps(oldItems: DtcOrderItem[], newItems: DtcOrderItem[]): DeltaOp[] {
  const oldM = qtyByInventoryItemId(oldItems)
  const newM = qtyByInventoryItemId(newItems)
  const keys = new Set([...oldM.keys(), ...newM.keys()])
  const deltas: DeltaOp[] = []
  for (const k of keys) {
    const delta = (newM.get(k) ?? 0) - (oldM.get(k) ?? 0)
    if (delta !== 0) deltas.push({ id: new ObjectId(k), delta })
  }
  return deltas
}

/**
 * Applies net stock movement when order line items change (`delta > 0` sells more stock).
 */
export async function applyInventoryDeltaForOrderItems(
  db: Db,
  oldItems: DtcOrderItem[],
  newItems: DtcOrderItem[],
): Promise<void> {
  const deltas = buildInventoryDeltaOps(oldItems, newItems)
  const applied: DeltaOp[] = []
  try {
    for (const { id, delta } of deltas) {
      if (delta > 0) {
        const r = await decrementDtcInventoryOnHandById(db, id, delta)
        if (r === 'not_found') {
          throw new DtcOrderInventoryError(
            'NOT_FOUND',
            'One or more inventory lines no longer exist. Refresh the page and pick products again.',
          )
        }
        if (r === 'insufficient') {
          throw new DtcOrderInventoryError(
            'INSUFFICIENT',
            'Insufficient stock for the updated quantities.',
          )
        }
      } else if (delta < 0) {
        await incrementDtcInventoryOnHandById(db, id, -delta)
      }
      applied.push({ id, delta })
    }
  } catch (e) {
    for (const a of applied.slice().reverse()) {
      if (a.delta > 0) await incrementDtcInventoryOnHandById(db, a.id, a.delta)
      else if (a.delta < 0) await decrementDtcInventoryOnHandById(db, a.id, -a.delta)
    }
    throw e
  }
}

/** Restores stock for every inventory-linked line on an order (e.g. before delete). */
export async function restoreInventoryForOrderItems(db: Db, items: DtcOrderItem[]): Promise<void> {
  const ops = inventoryDecrementOpsFromOrderItems(items)
  for (const op of ops) {
    await incrementDtcInventoryOnHandById(db, op.id, op.qty)
  }
}
